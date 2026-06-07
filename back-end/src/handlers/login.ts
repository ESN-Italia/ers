///
/// IMPORTS
///

import { default as Axios } from 'axios';
import { parseStringPromise } from 'xml2js';
import { sign } from 'jsonwebtoken';
import { DynamoDB, HandledError, ResourceController, SystemsManager } from 'idea-aws';

import { User } from '../models/user.model';
import { Configurations } from '../models/configurations.model';

///
/// CONSTANTS, ENVIRONMENT VARIABLES, HANDLER
///

const CAS_URL = 'https://accounts.esn.org/cas';
const JWT_EXPIRE_TIME = '1 day';

const PROJECT = process.env.PROJECT;
const APP_DOMAIN = process.env.APP_DOMAIN;
const APP_URL = 'https://'.concat(APP_DOMAIN);

const DDB_TABLES = { configurations: process.env.DDB_TABLE_configurations };
const ddb = new DynamoDB();

const SECRETS_PATH = `/${PROJECT}/auth`;
const systemsManager = new SystemsManager();

let JWT_SECRET: string;

export const handler = (ev: any): Promise<any> => new Login(ev).handleRequest();

///
/// RESOURCE CONTROLLER
///

class Login extends ResourceController {
  host: string;
  stage: string;

  constructor(event: any) {
    super(event);
    this.host = event.headers?.host ?? null;
    this.stage = process.env.STAGE ?? null;
  }

  protected async getResources(): Promise<any> {
    try {
      // build a URL to valid the ticket received (consider also the localhost exception)
      const localhost = this.queryParams.localhost ? `?localhost=${this.queryParams.localhost}` : '';
      const serviceURL = `https://${this.host}/${this.stage}/login${localhost}`;
      const validationURL = `${CAS_URL}/serviceValidate?service=${serviceURL}&ticket=${this.queryParams.ticket}`;

      const ticketValidation = await Axios.get(validationURL);
      const jsonWithUserData = await parseStringPromise(ticketValidation.data);
      this.logger.debug('CAS ticket validated and parsed', { ticket: jsonWithUserData });

      const success = !!jsonWithUserData['cas:serviceResponse']['cas:authenticationSuccess'];
      if (!success) throw new HandledError('Login failed');

      const data = jsonWithUserData['cas:serviceResponse']['cas:authenticationSuccess'][0];
      const attributes = data['cas:attributes'][0];
      const userId = String(data['cas:user'][0]).toLowerCase();

      const { administratorsIds, opportunitiesManagersIds, dashboardManagersIds, ersManagersIds } =
        await this.loadOrInitConfigurations(userId);

      const additionalSectionCodes = attributes['cas:extended_roles']
        .filter((role: string) => role.startsWith('Local'))
        .map((role: string) => role.split(':')[1])
        .reduce((acc: string[], sectionCode: string) => {
          if (!acc.includes(sectionCode) && sectionCode !== attributes['cas:sc'][0]) acc.push(sectionCode);
          return acc;
        }, []);

      const convertSectionCodes = async (codes: string[]): Promise<string[]> => {
        const promises = codes.map(async (code) => {
          try {
            const response = await Axios.get(`https://accounts.esn.org/api/v2/sections/${code}`);
            return response.data?.label || null;
          } catch (err) {
            return null;
          }
        });
        const results = await Promise.all(promises);
        return results.filter((name): name is string => name !== null);
      };

      const convertDate = (d: string) => {
        // CAS return dates in dd/mm/yyyy format, so we need to convert them to ISO string (date part)
        const dateParts = d.split("/");
        const convertedDate = new Date(Number(dateParts[2]), Number(dateParts[1]) - 1, Number(dateParts[0]));
        return convertedDate.toISOString().substring(0, 10);
      }

      const convertGender = (g: string) => {
        if (g == undefined) return null;

        switch (g) {
          case 'M': return Genders.MALE;
          case 'F': return Genders.FEMALE;
          default: return Genders.OTHER;
        }
      }

      const additionalSectionNames = await convertSectionCodes(additionalSectionCodes);

      const user = new User({
        userId,
        email: attributes['cas:mail'][0],
        sectionCode: attributes['cas:sc'][0],
        additionalSectionCodes: additionalSectionCodes,
        additionalSectionNames: additionalSectionNames,
        firstName: attributes['cas:first'][0],
        lastName: attributes['cas:last'][0],
        roles: attributes['cas:roles'],
        section: attributes['cas:section'][0],
        country: attributes['cas:country'][0],
        avatarURL: attributes['cas:picture'][0],
        birthDate: convertDate(attributes['cas:birthdate'][0]),
        nationality: attributes['cas:nationality']?.[0],
        gender: convertGender(attributes['cas:gender']?.[0]),
        phone: attributes['cas:telephone']?.[0],
        isAdministrator: administratorsIds.includes(userId),
        canManageOpportunities: administratorsIds.includes(userId) || opportunitiesManagersIds.includes(userId),
        canManageDashboard: administratorsIds.includes(userId) || dashboardManagersIds.includes(userId),
        canManageERSEvents: administratorsIds.includes(userId) || ersManagersIds.includes(userId)
      });
      this.logger.info('ESN Accounts login', { user });

      const userData = JSON.parse(JSON.stringify(user));
      const secret = await getJwtSecretFromSystemsManager();
      const token = sign(userData, secret, { expiresIn: JWT_EXPIRE_TIME });

      // redirect to the front-end with the fresh new token (instead of resolving)
      const appURL = this.queryParams.localhost ? `http://localhost:${this.queryParams.localhost}` : APP_URL;
      this.returnStatusCode = 302;
      this.returnHeaders = { Location: `${appURL}/auth?token=${token}` };
      return {};
    } catch (err) {
      this.logger.error('VALIDATE CAS TICKET', err);
      throw new HandledError('Login failed');
    }
  }

  private async loadOrInitConfigurations(firstAdminId: string): Promise<Configurations> {
    try {
      return new Configurations(
        await ddb.get({ TableName: DDB_TABLES.configurations, Key: { PK: Configurations.PK } })
      );
    } catch (err) {
      if (String(err) === 'Error: Not found') {
        const configurations = new Configurations({ PK: Configurations.PK, administratorsIds: [firstAdminId] });
        await ddb.put({
          TableName: DDB_TABLES.configurations,
          Item: configurations,
          ConditionExpression: 'attribute_not_exists(PK)'
        });
        return configurations;
      } else throw new HandledError('Error loading configuration');
    }
  }
}

const getJwtSecretFromSystemsManager = async (): Promise<string> => {
  if (!JWT_SECRET) JWT_SECRET = await systemsManager.getSecretByName(SECRETS_PATH);
  return JWT_SECRET;
};

/**
 * The possible types of genders.
 */
export enum Genders {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER'
}
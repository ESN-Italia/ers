#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import * as DDB from 'aws-cdk-lib/aws-dynamodb';

import { IDEAStack } from './idea-stack';
import { MediaStack } from './media-stack';
import { ApiDomainStack } from './api-domain-stack';
import { SESStack } from './ses-stack';
import { ResourceController, ApiStack, DDBTable } from './api-stack';
import { FrontEndStack } from './front-end-stack';

import { parameters, stages, Stage, PROD_CUSTOM_DOMAIN } from './environments';

//
// RESOURCES
//

const apiResources: ResourceController[] = [
  { name: 'auth', isAuthFunction: true },
  { name: 'login', paths: ['/login'] },
  { name: 'configurations', paths: ['/configurations'] },
  { name: 'media', paths: ['/media'] },
  { name: 'badges', paths: ['/badges', '/badges/{badge}'] },
  { name: 'usersBadges', paths: ['/usersBadges', '/usersBadges/{badge}'] },
  { name: 'scheduledOps' },
  { name: 'sesNotifications' },
  {
    name: 'ersEvents',
    paths: [
      '/ers-events',
      '/ers-events/{eventId}'
    ]
  },
  {
    name: 'ersRegistrations',
    paths: [
      '/ers-events/{eventId}/registrations',
      '/ers-events/{eventId}/registrations/{registrationId}'
    ]
  }
];

const tables: { [tableName: string]: DDBTable } = {
  configurations: {
    PK: { name: 'PK', type: DDB.AttributeType.STRING }
  },
  ersEvents: {
    PK: { name: 'eventId', type: DDB.AttributeType.STRING }
  },
  ersRegistrations: {
    PK: { name: 'eventId', type: DDB.AttributeType.STRING },
    SK: { name: 'registrationId', type: DDB.AttributeType.STRING },
    indexes: [
      {
        indexName: 'userId-index',
        partitionKey: { name: 'userId', type: DDB.AttributeType.STRING },
        projectionType: DDB.ProjectionType.ALL
      }
    ]
  },
  badges: {
    PK: { name: 'badgeId', type: DDB.AttributeType.STRING }
  },
  usersBadges: {
    PK: { name: 'userId', type: DDB.AttributeType.STRING },
    SK: { name: 'badge', type: DDB.AttributeType.STRING }
  },

};

//
// STACKS
//

const createApp = async (): Promise<void> => {
  const app = new cdk.App({});

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION };

  const STAGE = app.node.tryGetContext('stage');
  const STAGE_VARIABLES = (stages as any)[STAGE] as Stage;
  if (!STAGE_VARIABLES) {
    console.log('Missing stage (environments.ts); e.g. --parameters stage=dev\n\n');
    throw new Error();
  }

  //
  // GENERIC RESOURCES (they don't depend by the stage)
  //

  new IDEAStack(app, `idea-resources`);

  const mediaStack = new MediaStack(app, `${parameters.project}-media`, {
    env,
    mediaBucketName: `${parameters.project}-media`,
    mediaDomain: parameters.mediaDomain
  });

  const apiDomainStack = new ApiDomainStack(app, `${parameters.project}-api-domain`, {
    env,
    domain: parameters.apiDomain
  });

  const webSocketApiDomainStack = new ApiDomainStack(app, `${parameters.project}-socket-api-domain`, {
    env,
    domain: parameters.webSocketApiDomain
  });

  const sesStack = new SESStack(app, `${parameters.project}-ses`, {
    env,
    project: parameters.project,
    domain: parameters.apiDomain
  });

  //
  // STAGE-DEPENDANT RESOURCES
  //

  const apiStack = new ApiStack(app, `${parameters.project}-${STAGE}-api`, {
    env,
    project: parameters.project,
    stage: STAGE,
    apiDomain: parameters.apiDomain,
    apiDefinitionFile: './swagger.yaml',
    resourceControllers: apiResources,
    tables,
    mediaBucketArn: mediaStack.mediaBucketArn,
    ses: { identityArn: sesStack.identityArn, notificationTopicArn: sesStack.notificationTopicArn },
    removalPolicy: STAGE_VARIABLES.destroyDataOnDelete ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN,
    lambdaLogLevel: STAGE_VARIABLES.logLevel ?? 'INFO',
    appDomain: STAGE === 'prod' && PROD_CUSTOM_DOMAIN ? PROD_CUSTOM_DOMAIN : STAGE_VARIABLES.domain
  });
  apiStack.addDependency(mediaStack);
  apiStack.addDependency(apiDomainStack);
  apiStack.addDependency(webSocketApiDomainStack);
  apiStack.addDependency(sesStack);

  new FrontEndStack(app, `${parameters.project}-${STAGE}-front-end`, {
    env,
    project: parameters.project,
    stage: STAGE,
    domain: STAGE_VARIABLES.domain,
    alternativeDomains: STAGE_VARIABLES.alternativeDomains,
    certificateARN: parameters.frontEndCertificateARN
  });
};
createApp();

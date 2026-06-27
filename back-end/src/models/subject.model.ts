import { Resource } from 'idea-toolbox';

import { cleanESNAccountsIdForURL, isValidPhone } from './utils';

import { User, getUserOrigin } from './user.model';
import { UsersOriginDisplayOptions } from './configurations.model';

/**
 * A user subject to a topic, a questio, an answer, etc..
 */
export class Subject extends Resource {
  /**
   * The ESN Accounts ID of the subject (lowercase).
   */
  id: string;
  /**
   * The type of subject.
   */
  type: SubjectTypes;
  /**
   * The name of the subject.
   */
  name: string;
  /**
   * The URL to the subject's avatar.
   */
  avatarURL: string;
  /**
   * The name of the subject's ESN Section.
   */
  section: string;
  /**
   * The name of the subject's ESN country.
   */
  country: string;
  /**
   * The email for notifications.
   */
  email: string;
  /**
   * Phone number.
   */
  phone: string;
  /**
   * Birth date.
   */
  birthDate: string;
  /**
   * Birth place.
   */
  birthPlace: string;
  /**
   * Nationality.
   */
  nationality: string;
  /**
   * Gender.
   */
  gender: string;
  /**
   * Preferred pronouns (e.g. He/Him, She/Her, They/Them).
   */
  preferredPronouns?: string[];
  /**
   * Additional section names in ESN Accounts.
   */
  additionalSectionNames?: string[];

  /**
   * Create a new subject starting from a user.
   */
  static fromUser(user: User): Subject {
    return new Subject({
      id: user.userId,
      type: SubjectTypes.USER,
      name: user.firstName.concat(' ', user.lastName),
      avatarURL: user.avatarURL,
      section: user.section,
      country: user.country,
      email: user.email,
      phone: user.phone,
      birthDate: user.birthDate,
      nationality: user.nationality,
      gender: user.gender,
      additionalSectionNames: user.additionalSectionNames
    });
  }

  load(x: any): void {
    super.load(x);
    this.id = this.clean(x.id, String)?.toLowerCase();
    this.type = this.clean(x.type, String);
    this.name = this.clean(x.name, String);
    if (this.type === SubjectTypes.USER) {
      this.avatarURL = this.clean(x.avatarURL, String);
      this.section = this.clean(x.section, String);
      this.birthDate = this.clean(x.birthDate, String);
      this.nationality = this.clean(x.nationality, String);
      this.email = this.clean(x.email, String);
      this.phone = this.clean(x.phone, String);
      this.gender = this.clean(x.gender, String);
      this.birthPlace = this.clean(x.birthPlace, String);
      this.preferredPronouns = this.cleanArray(x.preferredPronouns, String);
      this.additionalSectionNames = this.cleanArray(x.additionalSectionNames, String);
    } else {
      delete this.avatarURL;
      delete this.section;
      delete this.birthDate;
      delete this.nationality;
      delete this.email;
      delete this.phone;
      delete this.gender;
      delete this.birthPlace;
      delete this.preferredPronouns;
      delete this.additionalSectionNames;
    }
    if (this.type !== SubjectTypes.COUNTRY) {
      this.country = this.clean(x.country, String);
    } else {
      delete this.country;
    }
    this.email = this.clean(x.email, String);
  }

  validate(): string[] {
    const e = super.validate();
    if (this.iE(this.id)) e.push('id');
    if (this.iE(this.type)) e.push('type');
    if (this.iE(this.name)) e.push('name');
    if (this.type === SubjectTypes.USER) {
      if (this.iE(this.section)) e.push('section');
      if (this.iE(this.email)) e.push('email');
      if (this.iE(this.phone) || !isValidPhone(this.phone)) e.push('phone');
      if (this.iE(this.birthDate)) e.push('birthDate');
      if (this.iE(this.birthPlace)) e.push('birthPlace');
      if (this.iE(this.nationality)) e.push('nationality');
      if (this.iE(this.gender)) e.push('gender');
    }
    if (this.type !== SubjectTypes.COUNTRY) {
      if (this.iE(this.country)) e.push('country');
    }
    return e;
  }

  /**
   * Get the subject's URL in ESN Accounts.
   */
  getURL(): string {
    const BASE_URL = 'https://accounts.esn.org/';
    const cleanedId = cleanESNAccountsIdForURL(this.id);
    switch (this.type) {
      case SubjectTypes.USER:
        return BASE_URL.concat('user/', cleanedId);
      case SubjectTypes.COUNTRY:
        return BASE_URL.concat('country/', cleanedId);
      case SubjectTypes.SECTION:
        return BASE_URL.concat('section/', cleanedId);
    }
  }

  /**
   * Get a string representing the origin of the subject.
   */
  getOrigin(displayOption: UsersOriginDisplayOptions = UsersOriginDisplayOptions.BOTH): string {
    return getUserOrigin(this, displayOption);
  }
}

/**
 * The possible type of subjects.
 */
export enum SubjectTypes {
  USER = 'USER',
  SECTION = 'SECTION',
  COUNTRY = 'COUNTRY'
}

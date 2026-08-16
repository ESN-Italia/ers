# ESN Italia - ERS (Event Registration System)

ERS is a web and mobile-ready platform developed for **[ESN Italia](https://esn.it)** to manage registrations, spot allocations, and attendee lists for national and local events.

For inquiries, support, or onboarding, contact the **Commissione Informatica (CommIT) of ESN Italia** at `commit_development@esn.it`

---

## Features

- **Event management**: Create and configure events, set registration windows, deadlines, and requirements.
- **Custom registration forms**: Design dynamic custom forms with flexible fields tailored to specific event needs.
- **Custom ESN roles & permissions**: Granular role configuration for Administrators, Event Managers, and Participants.
- **Quota & spot allocation**: Distribute and manage spots across ESN sections with customizable limits.
- **Registration workflow**: Handle participant submissions, spot validation, statuses, and waiting lists.
- **Export & reporting**: Generate attendee lists and exports in CSV format for event managers.

---

## Tech Stack

- **Frontend**: [Ionic](https://ionicframework.com/) / [Angular](https://angular.dev/)
- **Backend**: Serverless infrastructure on AWS with [AWS CDK](https://aws.amazon.com/cdk/) (API Gateway, Lambda, DynamoDB, S3)

---

## Documentation

- **[Developer Setup & Contribution Guide](./CONTRIBUTING.md)**
- **[Deployment & Infrastructure Guide](./HOW-TO-DEPLOY.md)**

---

## Dictionary

- **Event**: A national or local ESN initiative requiring registration management.
- **Registration**: An application submitted by a user to attend an Event.
- **Spot**: A participation ticket category available for an event, which can include specific conditions, fees, and roles (e.g., Section Delegate, International Guest, Board Member).
- **Optional Ticket**: An extra activity that a user can optionally select during registration (e.g., merchandise, side events).
- **Manager**: A user authorized to manage spot allocations and registrations for an event.
- **Administrator**: A user with full access to configure the platform, events, and roles.

---

## License & Credits

![CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)

- **ERS (Event Registration System)** is developed and maintained by the **Commissione Informatica of [ESN Italia](https://esn.it)** under the [CC BY-NC-SA 4.0](./LICENSE) license.
- **Original Base**: Built upon the architecture of **[Assembly app](https://github.com/uatisdeproblem/esn-assembly)**, created in 2023 by [Matteo Carbone](https://matteocarbone.com) for [Erasmus Student Network](https://esn.org), licensed under [CC BY-NC-SA 4.0](./LICENSE).

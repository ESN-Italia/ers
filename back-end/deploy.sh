#!/bin/bash

# project-specific parameters
AWS_PROFILE='ers-esn-italia'
PROJECT='ers-esn-italia'

# other parameters
ACTION=$1
STAGE=$2
SRC_FOLDER='src/'
C='\033[4;32m' # color
NC='\033[0m'   # reset (no color)

# disable pagination in aws cli commands
export AWS_PAGER=""

# set the script to exit in case of errors
set -o errexit

# parameters validation
if [ "${ACTION}" == "" ]
then
  echo -e "${C}First parameter: quick|dev|prod|diff${NC}"
  echo -e "${C}\t - quick:    quickly deploy the development API's Lambda code (hotswap, no CloudFormation)${NC}"
  echo -e "${C}\t - dev:      deploy the development back-end environment (only its own stacks)${NC}"
  echo -e "${C}\t - prod:     deploy the production back-end environment (all the stacks)${NC}"
  echo -e "${C}\t - diff:     show what deploying the stage in the second parameter would change, without deploying${NC}"
  echo -e "${C}Second parameter: dev|prod (only if the first parameter is 'diff')${NC}"
  exit -1
fi
if [ "${ACTION}" != "quick" ] && [ "${ACTION}" != "dev" ] && [ "${ACTION}" != "prod" ] && [ "${ACTION}" != "diff" ]
then
   >&2 echo -e "${C}The first parameter is the ACTION: quick|dev|prod|diff${NC}"
  exit -1
fi
if [ "${ACTION}" == "diff" ] && [ "${STAGE}" != "dev" ] && [ "${STAGE}" != "prod" ]
then
   >&2 echo -e "${C}The second parameter is the STAGE to compare: dev|prod${NC}"
  exit -1
fi

# the stacks that belong to a stage; the others (media, domains, SES, IDEA resources) are shared by all the stages
stage_stacks() {
  echo "${PROJECT}-$1-api ${PROJECT}-$1-front-end"
}

# install the npm modules, unless they are already in line with package.json and package-lock.json
install_npm_modules() {
  local installed='node_modules/.package-lock.json'
  if [ -f "${installed}" ] && [ "${installed}" -nt package-lock.json ] && [ "${installed}" -nt package.json ]
  then
    echo -e "${C}npm modules up to date, skipping install${NC}"
  else
    echo -e "${C}Installing npm modules...${NC}"
    npm i --silent 1>/dev/null
    touch "${installed}"
  fi
}

# run the deploy-quick script with AWS CDK and exit
if [ "${ACTION}" == "quick" ]
then
  npm run compile && npm run deploy "${PROJECT}-dev-api" \
    -- --context stage=dev --exclusively --hotswap --profile ${AWS_PROFILE}
  exit 0
fi

install_npm_modules

# lint the code in search for errors
echo -e "${C}Linting...${NC}"
npm run lint ${SRC_FOLDER} 1>/dev/null

# compiling models
echo -e "${C}Compiling...${NC}"
npm run compile 1>/dev/null

# show the changes, without deploying anything
if [ "${ACTION}" == "diff" ]
then
  echo -e "${C}Comparing with the deployed stacks...${NC}"
  if [ "${STAGE}" == "dev" ]
  then
    npm run cdk -- diff $(stage_stacks dev) --exclusively --context stage=dev --profile ${AWS_PROFILE}
  else
    npm run cdk -- diff --all --context stage=prod --profile ${AWS_PROFILE}
  fi
  exit 0
fi

# build and deploy with AWS CDK
echo -e "${C}Deploying CDK stacks...${NC}"
if [ "${ACTION}" == "dev" ]
then
  # Only the development stacks: the shared ones are used by production too, so they are deployed with 'prod'.
  # Lambda code changes are hotswapped (seconds); any other change falls back to a CloudFormation deployment.
  npm run deploy -- $(stage_stacks dev) --exclusively --context stage=dev --require-approval never \
    --hotswap-fallback --concurrency 2 --profile ${AWS_PROFILE}
else
  npm run deploy -- --context stage=prod --all --require-approval never --profile ${AWS_PROFILE}
fi

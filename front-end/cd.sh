#!/bin/bash

# project specific parameters
DOMAIN_PROD='ers-esnitalia.click'
DOMAIN_DEV='dev.ers-esnitalia.click'

# other parameters
ACTION=$1
SRC_FOLDER="src/"
C='\033[4;32m' # color
NC='\033[0m'   # reset (no color)

# disable pagination in aws cli commands
export AWS_PAGER=""

# set the script to exit in case of errors
set -o errexit

# parameters validation
if [ "${ACTION}" != "dev" ] && [ "${ACTION}" != "prod" ]
then
  echo -e "${C}Target environment: dev|prod${NC}"
  echo -e "${C}\t - dev:    release the front-end in the development environment${NC}"
  echo -e "${C}\t - prod:   release the front-end in the production environment${NC}"
  exit -1
fi

if [ "${ACTION}" == 'prod' ]
then
  DOMAIN=${DOMAIN_PROD}
else
  DOMAIN=${DOMAIN_DEV}
fi
echo -e "${C}Target domain: ${DOMAIN}${NC}"

# get the target CloudFront distribution and S3 bucket (from the domain)
DISTRIBUTION=`aws cloudfront list-distributions --query "DistributionList.Items[*].{Id: Id, Aliases: Aliases.Items[?(@ == '${DOMAIN}')]} | [?Aliases].[Id]" --output text`
BUCKET=`aws cloudfront get-distribution --id ${DISTRIBUTION} --output text \
 --query "Distribution.DistributionConfig.Origins.Items[0].DomainName" | cut -d "." -f 1`

# upload the project's files to the S3 bucket (with no-cache header for index.html)
echo -e "${C}Uploading...${NC}"
aws s3 sync ./www s3://${BUCKET} --delete --exclude "index.html" --exclude ".well-known/*" 1>/dev/null
aws s3 cp ./www/index.html s3://${BUCKET}/index.html --cache-control "max-age=43200, must-revalidate" 1>/dev/null

# invalidate all files from the CloudFront distribution
echo -e "${C}Cleaning...${NC}"
aws cloudfront create-invalidation --distribution-id ${DISTRIBUTION} \
  --paths "/*" \
  1>/dev/null

echo -e "${C}Done!${NC}"
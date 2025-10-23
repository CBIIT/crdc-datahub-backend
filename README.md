# CRDC DataHub Backend

Last Updated: 06 June 2023

[GitHub Repository](https://github.com/CBIIT/crdc-datahub-backend)  

## Contents

 - [Introduction](#introduction)
 - [Prerequisites](#prerequisites)
 - [Configuring Environment Variables](#configuring-environment-variables)
   - [List of Environment Variables](#list-of-environment-variables)
   - [Creating a .env File](#creating-a-env-file)
 - [Running the CRDC DataHub Backend API](#running-the-crdc-datahub-backend-api)
 - [List of API Endpoints](#list-of-api-endpoints)

## Introduction

This API is used to store and query data related to the CRDC DataHub pre-submission form workflow.

## Prerequisites

 - Node.js version 18.16.0 is installed on the runtime environment
 - A MongoDB deployment is accessible, running, and a user has been created for this API

## Configuring Environment Variables

Environment variables can either be set in the runtime environment or specified using a .env file.

### List of Environment Variables

 - **VERSION** - The API version
 - **DATE** - The date that the API was built
 - **MONGO_DB_USER** - The MongoDB username for this API connection
 - **MONGO_DB_PASSWORD** - The MongoDB password for this API connection
 - **MONGO_DB_HOST** - The MongoDB deployment host address
 - **MONGO_DB_PORT** - The MongoDB connection port
 - **SESSION_SECRET** - A session secret key, this must match in all services that will share a session
 - **SESSION_TIMEOUT_SECONDS** - The number of seconds before a session created or updated by this service will expire
 - **EMAIL_SMTP_HOST**: email server hostname
 - **EMAIL_SMTP_PORT**: email server port number
 - **EMAIL_USER**: email server's username as an additional parameter
 - **EMAIL_PASSWORD**: email server's password as an additional parameter
 - **EMAIL_URL**: the website URL in the email template sent to the user.
 - **EMAILS_ENABLED**: If not set to "true", then the email notifications will be disabled
 - **SCHEDULE_JOB**: Set a time expression to schedule a cron job
 - **SUBMISSION_DOC_URL**: Set the url for submission documentation
 - **DASHBOARD_SESSION_TIMEOUT**: Set the timeout for AWS QuickSight dashboard by default 30 minutes
 - **DATA_COMMONS_LIST**: JSON array of available data commons (e.g., ["CDS", "ICDC", "CTDC", "CCDI", "PSDC", "Test MDF", "Hidden Model"])
### Creating a .env File

1. Locate the [**env.template**](./env.template) file and create a copy
2. Rename the copy to **.env**
3. Replace the variable values in the ".env" file with the correct values for your target runtime environment
4. Save the .env file

## Running the CRDC DataHub Backend API

1. Verify that all the [prerequisites](#prerequisites) listed in this document are satisfied
2. Set up the required runtime environment variables
3. Install dependencies with npm using the following command: ```npm install```
4. Run the CRDC DataHub Backend API with the following command: ```npm start```

**Note**: Steps 1-3 are only required the first time that you are running this program. If there are no changes to the code, then this can be re-run using only step 4.

## List of API Endpoints

 - **/version** - Accepts ```GET``` requests and returns the values of the **VERSION** and **DATE** environment variables in JSON format
 - **/ping** - Accepts ```GET``` requests and returns the string "pong", used primarily to check if this API is running
 - **/api/graphql** - Accepts ```POST``` requests containing GraphQL queries and returns the query results


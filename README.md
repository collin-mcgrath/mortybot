### Overview
A simple Semaphore/Slack webhook integration to output information about the latest build. It uses AWS Lambda to listen for the build webhook and fire requests to Slack and back to Semaphore if needed.

Semaphore fires a webhook with build ID upon build completion > Mortybot grabs the ID > Mortybot sends an API request to Semaphore to get the build logs > Mortybot parses the response, figures out whether the build passed, failed, or had something weird happen, and sends a simple Slack webhook to the designated channel. If the build failed, Mortybot sends a request back to Semaphore to rebuild. It will continue rebuilding until a non-failing build runs.

### Setup
To set it up, create a `config.json` file in the root of the project directory. It should include the following information.

```
{
  "semaphoreAuth" : "",
  "projectHashID" : "",
  "branchID" : "",
  "slackChannelURL" : "",
  "slackApiToken" : "",
  "slackChannelID" : ""
}
```

### Running it locally
If you want to test locally, you will need to create an `event.json` file in the root of the project that mimics the request body that you want you AWS Lambda function to handle. Also create a `context.json` file containing just
```
{}
```

`npm install` and run `npm start` to use `node-lambda` and run the code.

Context on `node-lambda` found here: https://github.com/motdotla/node-lambda-template

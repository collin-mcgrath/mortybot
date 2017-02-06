A simple Semaphore/Slack webhook integration to output information about the latest build.

Semaphore fires a webhook with build ID upon build completion > Mortybot grabs the ID > Mortybot sends an API request to Semaphore to get the build logs > Mortybot parses the response and sends a simple Slack webhook to the designated channel.

To set it up, create a `config.json` file in the root of the project directory. It should include the following information.

```
{
  "semaphoreAuth" : <AUTH>,
  "projectHashID" : <ID>,
  "branchID" : <ID>,
  "slackChannelURL" : <URL>
}
```

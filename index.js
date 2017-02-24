var express = require('express'),
    bodyParser = require('body-parser'),
    request = require('request'),
    WebClient = require('@slack/client').WebClient,
    app = express(),
    port = process.env.PORT || 3000;

// Tries to get local secrets from config.json if present
// Falls back to Heroku config if not
try {
  config = require('./config.json');
  console.log("Required local dev config");
} catch (err) {
  console.log("Local config.json not needed on Heroku. Using Heroku config instead.");
}
var semaphoreAuth = process.env.SEMAPHORE_AUTH || config.semaphoreAuth;
var projectHashID = process.env.PROJECT_HASH_ID || config.projectHashID;
var branchID = process.env.BRANCH_ID || config.branchID;
var slackChannelURL = process.env.SLACK_CHANNEL_URL || config.slackChannelURL;
var token = process.env.SLACK_API_TOKEN || config.slackApiToken;
var web = new WebClient(token);
var CHANNEL_ID = "C3RGQL1BN";

app.use(bodyParser.json());

// Just to show it's live
app.get('/', function (req, res) {
  res.send("Welcome to Mortybot!");
});

// Catches the Semaphore webhook that is configured to fire after a build has finished
app.post('/', function (req, res) {
  console.log("Request received. Request body:\n" + JSON.stringify(req.body));

  // Do not get build for feature branches.
  if (req.body.branch_name == "master") {
    getBuildLogs(req);
  }
  else {
    console.log("Request is for a feature branch. Stopping execution.");
  }

  res.json({
    message: 'Request received.'
  });
});

// Builds the URL and makes a GET request to the Semaphore API to get the full build logs
function getBuildLogs (req) {
  var buildNumber = req.body.build_number;
  var results;
  var buildUrl = "https://semaphoreci.com/api/v1/projects/" + projectHashID + "/" + branchID + "/builds/" + buildNumber + "/log?auth_token=" + semaphoreAuth;
  console.log("Getting logs for build " + buildNumber + ".");
  request(buildUrl, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var parsed = JSON.parse(body);
      // Need to handle the case where build bombs out before reaching the last command.
      try {
        var output = parsed.threads[0].commands[8].output;
        results = output.split("-------------------------------------------------------------------------------")[2];
      } catch (err) {
        console.log("No output detected. Falling back to execution expired message");
        // Catches the case where the build dies before the final command runs
        // TODO: Do this better
        results = "Unknown failure";
      }

      sendSlackMessage(req, results);
    }
  });
}

// TODO: Should probably pass this as a callback to getBuildLogs
function sendSlackMessage (req, message) {
  var body = formatSlackMessage(req, message);

  // Sends a POST request to a Slack channel
  request({
    url: slackChannelURL,
    method: 'POST',
    body: JSON.stringify(body)
  });

  console.log("Sending message to " + body.channel + " Slack channel. Message body included below: \n" + JSON.stringify(body));
}

// Formats the message based on the success of the build
// TODO: Could definitely be DRYer
function formatSlackMessage(req, message) {
  buildNumber = req.body.build_number;
  buildURL = req.body.build_url;
  body = {};
  body.channel = "#qabot_testing";
  body.username = "Morty";
  body.icon_url = "http://images.8tracks.com/cover/i/009/572/299/morty-9356.jpg?rect=0,0,500,500&q=98&fm=jpg&fit=max";

  body.attachments = [];
  attachment = {};

  // TODO: Move into switch statement
  // Handles builds where execution expired and no results are recorded
  // "Unknown failure" happens when the build dies before the final command runs (e.g. K8 launch failure)
  if (message == "Unknown failure" || message === undefined) {
    attachment.title = "<" + buildURL + "|Build " + buildNumber + ">";
    attachment.text = "No information. Please examine build logs.";
    attachment.fallback = "Build " + buildNumber + " failed";
    attachment.color = 'warning';
    console.log("No results found for build " + buildNumber + ". Most likely execution expired or a setup command failed.");
  }
  // >=1 FAILED build
  else if (message.includes("FAILED")) {
    attachment.title = "<" + buildURL + "|Build " + buildNumber + " Failed>";
    attachment.text = message;
    attachment.fallback = "Build " + buildNumber + " failed";
    attachment.color = 'danger';
    console.log("Build " + buildNumber + " failed");
  }
  // All passing builds
  else {
    attachment.title = "<" + buildURL + "|Build " + buildNumber + " Passed>";
    attachment.fallback = "Build " + buildNumber + " passed";
    attachment.color = 'good';
    console.log("Build " + buildNumber + " passed.");
  }
  body.attachments[0] = attachment;

  return body;
}

replyViaThread("Test message");

function replyViaThread(message) {
  web.channels.history(CHANNEL_ID, {count:1}, function(err, res) {
      if (err) {
          console.log('Error:', err);
      } else {
          threadID = res.messages[0].thread_ts || res.messages[0].ts;
          console.log('Thread Timestamp: ', threadID);
          web.chat.postMessage(CHANNEL_ID, message, {thread_ts : threadID}, function(err, res) {
            if (err) {
                console.log('Error:', err);
            } else {
                console.log('Response: ', res);
            }
          });
      }
  });
}

var server = app.listen(port, function () {
  var host = server.address().address;
  var port = server.address().port;
  console.log('Example app listening at http://%s:%s', host, port);
});

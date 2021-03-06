// Tries to get local secrets from config.json if present
// Falls back to Heroku config if not
try {
  config = require('./config.json');
  console.log("Required local dev config");
} catch (err) {
  console.log("Local config.json not needed on Heroku. Using Heroku config instead.");
}

// Constants and ENV stuff
var SEMAPHORE_AUTH = process.env.SEMAPHORE_AUTH || config.semaphoreAuth;
var PROJECT_HASH_ID = process.env.PROJECT_HASH_ID || config.projectHashID;
var BRANCH_ID = process.env.BRANCH_ID || config.branchID;
var SLACK_CHANNEL_URL = process.env.SLACK_CHANNEL_URL || config.slackChannelURL;
var TOKEN = process.env.SLACK_API_TOKEN || config.slackApiToken;
var CHANNEL_ID = process.env.SLACK_CHANNEL_ID || config.slackChannelID;

var express = require('express'),
    bodyParser = require('body-parser'),
    request = require('request'),
    WebClient = require('@slack/client').WebClient,
    app = express(),
    web = new WebClient(TOKEN),
    port = process.env.PORT || 3000;

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
  var buildUrl = "https://semaphoreci.com/api/v1/projects/" + PROJECT_HASH_ID + "/" + BRANCH_ID + "/builds/" + buildNumber + "/log?auth_token=" + SEMAPHORE_AUTH;
  console.log("Getting logs for build " + buildNumber + ".");
  request(buildUrl, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var logs = parseBuildLogs(body);

      // The callback is being fired too early. Just set to wait for now
      sendSlackMessage(req, logs.results);
      setTimeout(function() {
        replyViaThread(logs.failedTags);
      }, 3000);
    }
  });
}

// Return build summary and array of failed tag lists
function parseBuildLogs(rawLogs) {
  var logsJSON = JSON.parse(rawLogs);
  var results;
  var failedTags;

  try {
    var output = logsJSON.threads[0].commands[8].output;
    var logArray = output.split("-------------------------------------------------------------------------------");
    var buildLog = logArray[0];

    results = logArray[2];
    failedTags = parseFailedTags(buildLog);

  } catch (err) {
    console.log("ERROR: " + err);
    console.log("No output detected. Falling back to execution expired message");
    // Catches the case where the build dies before the final command runs.
    // TODO: Make better
    results = "Unknown failure";
    failedTags = "Unknown failure";
  }
  var logs = {results: results, failedTags: failedTags};
  return logs;
}

function parseFailedTags(logs) {
  if (logs.includes("Failed Example Tags:")) {
    // Loop through for all failed tags. Send each in a new thread message
    // Remove HTML formatting and put inside a code block
    var pieces = logs.split("Failed Example Tags:");
    var failureTags = [];
    var c = 0;
    pieces.forEach(function(){
      // We want the odd ones
      if (c % 2 == 1) {
        // TODO: the parsing could obviously be improved
        failureTags.push('```' + pieces[c].split("Failures:")[0].split("Rerun")[0].replace(/<(?:.|\n)*?>/gm, '').trim().replace(/ /g,'').replace(/\)/g, ') ') + '```');
      }
      c += 1;
    });
  } else {
    console.log("No failed tags found");
  }
  return(failureTags);
}

// Formats the message based on the success of the build
// TODO: Could definitely be DRYer
function formatSlackMessage(req, message) {
  var buildNumber = req.body.build_number;
  var buildURL = req.body.build_url;
  var body = {
    channel: "#qabot_testing",
    username: "Morty",
    icon_url: "http://images.8tracks.com/cover/i/009/572/299/morty-9356.jpg?rect=0,0,500,500&q=98&fm=jpg&fit=max",
    attachments: []
  };
  var attachment = {};

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
    var rebuildURL = "https://semaphoreci.com/api/v1/projects/" + PROJECT_HASH_ID + "/" + BRANCH_ID + "/build" + "?auth_token=" + SEMAPHORE_AUTH;
    request({method: 'POST', url: rebuildURL}, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        console.log("Rebuild request sent");
        console.log(body);
      }
      else {
        console.log("Error sending rebuild request");
        console.log(response);
      }
    });
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

// Send the main Slack message (Build Failed, Passed, etc.)
function sendSlackMessage (req, message) {
  var body = formatSlackMessage(req, message);
  // Sends a POST request to the Slack channel
  request({
    url: SLACK_CHANNEL_URL,
    method: 'POST',
    body: JSON.stringify(body)
  });

  console.log("Sending message to " + body.channel + " Slack channel. Message body included below: \n" + JSON.stringify(body));
}

// Reply to the main message with the failed tags. Each tag group should be a new thread message
var replyViaThread = function replyViaThread(message) {
  try {
    message.forEach(function(reply) {
      web.channels.history(CHANNEL_ID, {count: 1}, function (err, res) {
        if (err) {
          console.log('Error:', err);
        }
        else {
          threadID = res.messages[0].thread_ts || res.messages[0].ts;
          console.log('Thread Timestamp: ', threadID);
          web.chat.postMessage(CHANNEL_ID, reply, {thread_ts: threadID, username: "Failed Tags"}, function (err, res) {
            if (err) {
              console.log('Error:', err);
            } else {
              console.log('Response: ', res);
            }
          });
        }
      });
    });
  }
  catch (err) {
    console.log("Thread reply not sent. The build probably passed but here's the error message: " + err.message);
  }
};

// Run the server
var server = app.listen(port, function () {
  var host = server.address().address;
  var port = server.address().port;
  console.log('Example app listening at http://%s:%s', host, port);
});

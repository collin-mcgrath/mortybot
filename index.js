var express = require('express'),
    bodyParser = require('body-parser'),
    request = require('request'),
    config = require('./config.json'),
    app = express(),
    port = 3000;

app.use(bodyParser.json());

app.post('/', function (req, res) {
    var buildNumber = req.body.build_number;
    getBuildLogs(buildNumber);
    res.json({
        message: 'Request received.'
    });
});

function getBuildLogs (buildNumber) {
    var results;
    var buildUrl = "https://semaphoreci.com/api/v1/projects/" + config.projectHashID + "/" + config.branchID + "/builds/" + buildNumber + "/log?auth_token=" + config.semaphoreAuth;
    console.log("Getting logs for build " + buildNumber + ".");
    request(buildUrl, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var parsed = JSON.parse(body);
            var output = parsed.threads[0].commands[8].output;
            var results = output.split("-------------------------------------------------------------------------------")[2];
            if (results === null) {
                results = output.split("\n");
                results = results[results.length - 1];
                console.log("No results found for build " + buildNumber + ". Printing last line:" + results);
            }
            sendSlackMessage(results);
        }
    });
}

function sendSlackMessage (message) {
    body = {};
    body.text = message;
    body.channel = "#qabot_testing";
    body.username = "Morty Smith";
    body.icon_emoji = ":morty:";

    request({
            url: config.slackChannelURL,
            method: 'POST',
            body: JSON.stringify(body)
        });
        console.log("Sending message to " + body.channel + " Slack channel. Message text included below: \n" + JSON.stringify(body));
    }

var server = app.listen(port, function () {
    var host = server.address().address;
    var port = server.address().port;
    console.log('Example app listening at http://%s:%s', host, port);
});

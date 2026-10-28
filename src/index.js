import axios from "axios";
import * as core from "@actions/core";
import * as github from "@actions/github";

async function run() {
  try {
    const webhook = core.getInput("webhook");

    if (github.context.eventName !== "push") {
      core.setFailed("This action only works on push events.");
    }

    if (
      !/https:\/\/discord(app|)\.com\/api\/webhooks\/\d+?\/.+/i.exec(webhook)
    ) {
      core.setFailed(
        'The given discord webhook url is invalid. Please ensure you give a **full** url that start with "https://discordapp.com/api/webhooks"',
      );
    }

    const shortSha = (i) => i.substr(0, 6);

    const escapeMd = (str) => str.replace(/([\[\]\\`\(\)])/g, "\\$1");

    const { payload: githubPayload } = github.context;

    // Git has commit count capped at 20
    const commitCount = githubPayload.size ?? githubPayload.commits.length;
    const commitWord = commitCount === 1 ? "commit" : "commits";

    core.setOutput("commit-count", String(commitCount));

    const commits = githubPayload.commits.map(
      (i) =>
        `- [\`[${shortSha(i.id)}]\`](${i.url}) ${escapeMd(i.message).replace(/(^-)/gm, " -")} - by ${i.author.name}`,
    );

    if (!commits.length) {
      return;
    }

    const beforeSha = githubPayload.before;
    const afterSha = githubPayload.after;
    const repoUrl = githubPayload.repository.html_url.replace(/\/$/, "");
    const compareUrl = `${repoUrl}/compare/${beforeSha}...${afterSha}`;

    function embedConstructor(arr, limit = 4096) {
      const result = [];
      let currentChunk = [];

      for (let i = 0; i < arr.length; i++) {
        const currentString = arr[i];

        if (currentChunk.join("\n").length + currentString.length > limit) {
          result.push(currentChunk.join("\n"));
          currentChunk = [];
        }

        currentChunk.push(currentString);
      }

      if (currentChunk.length > 0) {
        result.push(currentChunk.join("\n"));
      }

      const titleTemplate =
        core.getInput("message-title") || "Commits received";
      const title = titleTemplate
        .replace(/\{count\}/g, commitCount)
        .replace(/\{commits\}/g, commitWord);

      return result.map((i, index) => ({
        title: index === 0 ? title : "",
        description: i,
      }));
    }

    const payload = {
      content: "",
      embeds: embedConstructor(
        [
          `[\`\[${shortSha(beforeSha)}...${shortSha(afterSha)}\]\`](${compareUrl})`,
        ].concat(commits),
      ),
    };

    axios
      .post(webhook, payload)
      .then((res) => {
        core.setOutput("result", "Webhook sent");
      })
      .catch((err) => {
        core.setFailed(`Post to webhook failed, ${err}`);
      });
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();

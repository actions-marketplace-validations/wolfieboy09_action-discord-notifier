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
        `- [\`${shortSha(i.id)}\`](${i.url}) ${escapeMd(i.message.split("\n")[0]).replace(/^-/, " -")}`,
    );

    const beforeSha = githubPayload.before;
    const afterSha = githubPayload.after;
    const repoUrl = githubPayload.repository.html_url.replace(/\/$/, "");
    const compareUrl = `${repoUrl}/compare/${beforeSha}...${afterSha}`;

    const header = core.getInput("header");
    const editId = core.getInput("edit-message-id");

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

    const lines = [
      ...(header ? [`# ${header}`] : []),
      `[\`[${shortSha(beforeSha)}...${shortSha(afterSha)}\]\`](${compareUrl})`,
      ...commits,
    ];

    const payload = {
      content: "",
      embeds: embedConstructor(lines),
    };

    const res = editId
      ? await axios.patch(`${webhook}/messages/${editId}`, payload)
      : await axios.post(`${webhook}?wait=true`, payload);

    if (!editId) {
      core.setOutput("message-id", res.data.id);
    }
    core.setOutput("result", editId ? "Webhook message edited" : "Webhook sent");
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();

// PM2 config for the Publish Console. Matches the Valier "simple app" pattern:
// run `next start` from the release's node_modules. Copy/merge into
// /opt/apps/ecosystem.config.cjs on the droplet, or run standalone:
//   cd /opt/apps/moment-skis-publish-console/current && pm2 start deploy/ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "moment-skis-publish-console",
      script: "node_modules/.bin/next",
      args: "start -p 3006",
      cwd: "/opt/apps/moment-skis-publish-console/current",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: "3006",
      },
      out_file: "/opt/apps/moment-skis-publish-console/logs/out.log",
      error_file: "/opt/apps/moment-skis-publish-console/logs/error.log",
      max_memory_restart: "512M",
    },
  ],
};

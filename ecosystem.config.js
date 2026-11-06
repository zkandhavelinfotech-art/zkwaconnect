module.exports = {
  apps: [
    {
      name: "zkwaconnect-unified",
      script: "server.js",
      instances: "max",
      exec_mode: "cluster",
      env_production: {
        NODE_ENV: "production",
        PORT: 3002
      },
      env_development: {
        NODE_ENV: "development",
        PORT: 3002
      }
    }
  ]
};


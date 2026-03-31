module.exports = {
  apps: [
    {
      name: "kumamap",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};

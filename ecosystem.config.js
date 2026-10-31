module.exports = {
  apps: [
    {
      name: 'omni-bot',
      script: 'omni_bot.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      restart_delay: 2000,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};

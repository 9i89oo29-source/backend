module.exports = {
  apps: [
    {
      name: 'tigernum-backend',
      script: './dist/app.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      max_memory_restart: '500M',
      node_args: '--max-old-space-size=1024'
    }
  ]
};

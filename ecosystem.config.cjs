module.exports = {
  apps: [
    {
      name: "bg-remover-portal",
      script: "./dist/index.js",
      env: {
        NODE_ENV: "production",
        PORT: 3007,
        MONGODB_URI: "mongodb://root:ATtech%40132231@168.231.120.239:27017/bg_remover_portal?authSource=admin&directConnection=true&serverSelectionTimeoutMS=5000",
        GMAIL_USER: "abhijeet18012001@gmail.com",
        GMAIL_APP_PASSWORD: "uszzekqrdvpfvszh",
        SESSION_SECRET: "your-secret-here",
        RESEND_API_KEY: "re_...",
        CLOUDINARY_CLOUD_NAME: "dui1jsojt",
        CLOUDINARY_API_KEY: "788253253163851",
        CLOUDINARY_API_SECRET: "LGxeOBqys9s1XOEFLJUO7Cuy2nE"
      }
    }
  ]
};
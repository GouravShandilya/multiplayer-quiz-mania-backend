const { cleanEnv, str, port, url } = require('envalid');

const validateEnv = () => {
    cleanEnv(process.env, {
        PORT: port({ default: 5000 }),
        MONGO_URI: str(),
        CLIENT_URL: url({ default: 'http://localhost:3000' }),
        NODE_ENV: str({ choices: ['development', 'test', 'production', 'staging'], default: 'development' })
    });
};

module.exports = validateEnv;

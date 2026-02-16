import { FastifyLoggerOptions } from 'fastify';
import { PinoLoggerOptions } from 'fastify/types/logger';
import { config } from './index';

const devLoggerConfig: FastifyLoggerOptions & PinoLoggerOptions = {
  level: config.LOG_LEVEL,
  transport: {
    target: 'pino-pretty',
    options: {
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
      colorize: true,
    },
  },
};

const prodLoggerConfig: FastifyLoggerOptions & PinoLoggerOptions = {
  level: config.LOG_LEVEL,
  serializers: {
    req(request) {
      return {
        method: request.method,
        url: request.url,
        headers: {
          host: request.headers.host,
          'user-agent': request.headers['user-agent'],
          'content-type': request.headers['content-type'],
        },
      };
    },
    res(reply) {
      return {
        statusCode: reply.statusCode,
      };
    },
  },
};

export function getLoggerConfig(): FastifyLoggerOptions & PinoLoggerOptions {
  return config.NODE_ENV === 'production' ? prodLoggerConfig : devLoggerConfig;
}

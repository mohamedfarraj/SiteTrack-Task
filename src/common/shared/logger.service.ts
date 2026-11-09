// shared/logger.service.ts
import { Injectable } from '@nestjs/common';
import { WebClient } from '@slack/web-api';

@Injectable()
export class LoggerService {


  slackClient = new WebClient(
    process.env.SLACK_TOKEN,
  );

  async sendMessage(channel: string, text: string) {
    await this.slackClient.chat.postMessage({ channel, text });
  }

  log(message: string) {
    //this.sendMessage('#alplast', message);
    //console.log(message);
  }

  error(message: string, trace: string) {
    console.error(message, trace);
    this.sendMessage('#alplast', JSON.stringify({message, trace}));
  }

  warn(message: string) {
    console.warn(message);
  }


  debug(message: string) {
    console.debug(message);
  }
}

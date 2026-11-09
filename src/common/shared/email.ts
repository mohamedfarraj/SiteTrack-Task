/*
 * Aouther mohamed farraj
 * Date 20-9-2021
 * Description This file contains an Email Configertion
 */

import * as Email from 'email-templates';
import * as nodemailer from 'nodemailer';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

// In case using Google
const EmailConfig = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: process.env.SMTP_SECURE === 'true' ? true : false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false,
    secureProtocol: 'TLSv1_2_method'
  },

};

// langConfig
const langConfig = {
  locales: ['ar', 'en'],
  defaultLocale: 'en',
  directory: path.resolve('templates/i18n'),
};

export const transporter = nodemailer.createTransport(EmailConfig);

const SendEmail = new Email({
  message: {
    from: process.env.SMTP_USER || 'admin@nalplast.net',
  },
  views: {
    // directory where email templates reside
    root: path.resolve('templates'),
    options: {
      extension: 'ejs', // <---- HERE
    },
  },
  preview: false,
  transport: transporter,
  i18n: langConfig,
  // uncomment below to send emails in development/test env:
  send: true,
});

export const sendEmail = (body: Email) => {
  return new Promise((resolve, reject) => {
    const template = body.templateName;
    const lang = body.templateLang || 'en';
    const templateData = body.templateData || {};
    delete body.templateName;
    delete body.templateLang;
    delete body.templateData;
    SendEmail.send({
      template,
      message: body,
      locals: {
        locale: lang, // <------ CUSTOMIZE LOCALE HERE (defaults to `i18n.defaultLocale` - `en`)
        // Data to be sent to template engine.
        ...templateData,
      },
    })
      .then(resolve)
      .catch(reject);
  });
};

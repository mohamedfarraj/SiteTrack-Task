#!/usr/bin/env node
import { Command } from 'commander';
import { registerMakeModuleCommand } from './common/commands/make-module.command';


const program = new Command();

program
  .version('1.0.0')
  .description('CLI for NestJS project');

registerMakeModuleCommand(program);

program.parse(process.argv); 
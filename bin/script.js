#!/usr/bin/env node

const args = require('args')

args
  .option('include', 'Include', 'node|gulp|http:|https:')
  .option('exclude', 'Exclude', 'script.js|kill')

const flags = args.parse(process.argv)

const { exec } = require("child_process");

const helper = `ps`
const command = `PID=$(ps | grep -E '${flags.i}' | grep -Ev '${flags.e}' | awk {'print $1'})

if ps -p $PID > /dev/null
then
 kill -9 $PID
fi`

const execute = (com) => {
  return exec(com, (error, stdout, stderr) => {
    if (error) {
      console.log(`error: ${error.message}`);
      return;
    }
    if (stderr) {
      console.log(`stderr: ${stderr}`);
      return;
    }

    switch (com) {
      case helper:
        console.log(`All processes:\n${stdout}`);
        break;
      case command:
        console.log(`Processes killed.`);
        break;
      default:
        console.log(`stdout: ${stdout}`);
        break;
    }
  });
}

execute(helper)
execute(command)

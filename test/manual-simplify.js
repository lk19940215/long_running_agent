#!/usr/bin/env node
'use strict';

const { Engine } = require('../src');

async function main() {
  const userInput = '创建一个 hello world 函数。';

  console.log('Testing engine.plan()...\n');

  const engine = new Engine('plan', { projectRoot: process.cwd() });

  const result = await engine.plan(userInput, {
    projectRoot: process.cwd(),
    planOnly: true,
  });

  console.log('\n========== RESULT ==========');
  console.log('success:', result?.success);
  if (result?.planPath) {
    console.log('planPath:', result.planPath);
  }
  if (result?.reason) {
    console.log('reason:', result.reason);
  }
  if (result?.error) {
    console.log('error:', result.error);
  }
}

main();

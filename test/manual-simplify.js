#!/usr/bin/env node
'use strict';

const { main } = require('../src');

async function run() {
  const userInput = '创建一个 hello world 函数。';

  console.log('Testing main("plan")...\n');

  const result = await main('plan', userInput, {
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

run();

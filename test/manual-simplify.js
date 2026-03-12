#!/usr/bin/env node
'use strict';

const { runPlanSession } = require('../src/core/plan');

async function main() {
  const userInput = '创建一个 hello world 函数。';

  console.log('Testing runPlanSession...\n');

  const result = await runPlanSession(userInput, {
    projectRoot: process.cwd()
  });

  console.log('\n========== RESULT ==========');
  console.log('success:', result.success);
  if (result.targetPath) {
    console.log('targetPath:', result.targetPath);
  }
  if (result.reason) {
    console.log('reason:', result.reason);
  }
  if (result.error) {
    console.log('error:', result.error);
  }
}

main();
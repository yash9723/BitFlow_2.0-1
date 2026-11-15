# Load test

End-to-end test of a running BitFlow site: public pages, signed-in Icarus runs, and heavy (Verilator) runs.
Needs Node 18+ and nothing else. Run it from your own computer, not from the simulator server.

```bash
cd bitflow_frontend
node scripts/loadtest/loadtest.mjs --base https://bitflowvlsi.tech --stage all --accounts 20 --yes
```

- It creates 20 temporary `loadtest-xxxx` adult accounts (sign-up allows 5 a minute, so allow about 5 minutes), runs for roughly
  10 minutes, then **deletes the accounts**. If anything could not be deleted it prints the usernames.
- Stop at any time with Ctrl-C or `touch STOP` in the folder you run it from. It also stops itself if more than 5% of requests
  fail with a server error for 30 seconds.
- Stages: `--stage probe|anon|runs|heavy|all`. `--step-seconds 30` (default) sets the length of each step.
- Result: a table in the terminal and `loadtest-result.json` in the current folder. Send either to Claude.

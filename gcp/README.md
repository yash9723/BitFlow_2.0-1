# Google Cloud simulator hosts (free trial)

Credits: about $300 (INR 28,569) on the free trial, **ending 2 February 2027**. Everything here must be gone, or
deliberately upgraded, before then. Plan to tear down by **26 January 2027**.

The Vercel site calls the simulators from its functions in Virginia (`iad1`), so the useful place for a host is near
Virginia, not near the users: `us-east4` (Ashburn) is a few milliseconds from Vercel, Sydney is about 200 ms.

## Keep it in its own project
Create a project just for the VMs (for example `bitflow-sim`) under the same billing account. Credits belong to the
billing account, so they still apply, and **teardown is one command**: `gcloud projects delete bitflow-sim`.
Keep the Gemini key's project (`gen-lang-client-0184000331`) separate.

## 0. Budget alerts first (console)
Billing, Budgets & alerts, Create budget: scope the whole billing account, amount $300, alerts at 50 %, 75 %, 90 %
(and a second budget of about $100 a month). Add your email as a recipient. Google Cloud has **no hard stop**, so
these emails are the safety net; look at Billing, Reports once a week.

## 1. Main host: us-east4, e2-medium (about $30 a month with disk and IP; check the price calculator)
```bash
gcloud auth login
gcloud config set project bitflow-sim
gcloud services enable compute.googleapis.com
gcloud compute addresses create sim-us --region us-east4
gcloud compute firewall-rules create bitflow-web --allow tcp:80,tcp:443 --target-tags bitflow-sim
gcloud compute instances create bitflow-sim-us --zone us-east4-a --machine-type e2-medium \
  --image-family ubuntu-2404-lts-amd64 --image-project ubuntu-os-cloud \
  --boot-disk-size 30GB --boot-disk-type pd-balanced --address sim-us --tags bitflow-sim \
  --metadata-from-file startup-script=gcp/startup.sh \
  --metadata domain=sim-us.bitflowvlsi.tech,max_concurrent=2,cache_mb=256
gcloud compute addresses describe sim-us --region us-east4 --format='value(address)'   # the IP for DNS
```
Add an **A record** `sim-us.bitflowvlsi.tech` -> that IP at your registrar. Caddy gets its Let's Encrypt certificate
once the record resolves. Watch progress: `gcloud compute ssh bitflow-sim-us --zone us-east4-a --command 'tail -f /var/log/bitflow-setup.log'`
(setup takes about 10 minutes: it builds the image).

## 2. Always Free standby: us-east1, e2-micro (US regions us-west1, us-central1 and us-east1 qualify)
```bash
gcloud compute addresses create sim-standby --region us-east1
gcloud compute instances create bitflow-sim-standby --zone us-east1-b --machine-type e2-micro \
  --image-family ubuntu-2404-lts-amd64 --image-project ubuntu-os-cloud \
  --boot-disk-size 30GB --boot-disk-type pd-standard --address sim-standby --tags bitflow-sim \
  --metadata-from-file startup-script=gcp/startup.sh \
  --metadata domain=sim-standby.bitflowvlsi.tech,max_concurrent=1,cache_mb=64
```
The VM itself is free, but an external IPv4 address is billed (about $3.65 a month), and traffic out of Google Cloud beyond
the small free allowance is billed. 1 GB of RAM is tight: treat it as a standby with a low weight, not capacity.

## 3. Put them in the pool (Vercel production `BACKEND_URLS`)
Append, keeping the existing entries, for example
`...,https://sim-us.bitflowvlsi.tech|4,https://sim-standby.bitflowvlsi.tech|1`. Check `/api/simulate/health` lists every
host as `ok`, and that its per-host `ms` for `sim-us` is far below Sydney's. Then redeploy (env changes apply to new deployments).

## 4. Monitoring (Cloud Monitoring, console)
Monitoring, Uptime checks: HTTPS check on `https://sim-us.bitflowvlsi.tech/health`, one for the standby, one for Sydney
(`https://sim.bitflowvlsi.tech/health`) and one for `https://bitflowvlsi.tech/api/simulate/health`, from several regions.
Alerting: a policy on "uptime check fails" that emails you. Optionally install the Ops Agent on the VMs for memory and disk.

## 5. Teardown (by 26 January 2027)
1. Remove both `sim-us` and `sim-standby` from Vercel `BACKEND_URLS` and redeploy (the site keeps working on Sydney and Render).
2. `gcloud projects delete bitflow-sim` (VMs, disks, addresses, uptime checks).
3. Decide on the AI tutor: switch `BITFLOW_AI_PROVIDER` to a funded provider, remove `GEMINI_API_KEY`, or upgrade the account on purpose.
4. Remove the DNS A records.

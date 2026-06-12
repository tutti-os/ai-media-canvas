import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

function parseWorkflow(path) {
  const json = execFileSync(
    "ruby",
    [
      "-ryaml",
      "-rjson",
      "-e",
      "ARGV.each { |path| puts YAML.load_file(path).to_json }",
      path,
    ],
    { encoding: "utf8" },
  );
  return JSON.parse(json);
}

function workflowTriggers(workflow) {
  return workflow.on ?? workflow.true;
}

test("production Nextop app workflow publishes ai-media-canvas on main", async () => {
  const workflowPath = ".github/workflows/publish-nextop-app.yml";
  const source = await readFile(workflowPath, "utf8");
  const workflow = parseWorkflow(workflowPath);
  const on = workflowTriggers(workflow);
  const publish = workflow.jobs.publish;

  assert.equal(workflow.name, "Publish Nextop App Production");
  assert.equal(workflow.permissions.contents, "write");
  assert.deepEqual(on.push.branches, ["main"]);
  assert.equal(on.workflow_dispatch.inputs.publish_catalog.type, "boolean");
  assert.equal(on.workflow_dispatch.inputs.publish_catalog.default, false);
  assert.equal(
    publish.uses,
    "tutti-os/tutti/.github/workflows/publish-nextop-app-release.yml@main",
  );
  assert.equal(publish.with.app_id, "ai-media-canvas");
  assert.equal(publish.with.package_command, "pnpm package:nextop");
  assert.equal(publish.with.package_dir, "build/nextop-app/package");
  assert.equal(publish.with.icon_path, "build/nextop-app/package/icon.png");
  assert.match(source, /inputs\.publish_catalog/);
  assert.match(source, /NEXTOP_APP_RELEASES_PRODUCTION_PUBLISH_CATALOG/);
  assert.match(source, /catalog_cloudfront_distribution_id/);
  assert.match(source, /NEXTOP_APP_RELEASES_PRODUCTION_AWS_REGION/);
  assert.match(source, /NEXTOP_APP_RELEASES_AWS_ROLE_ARN/);
});

test("staging Nextop app workflow publishes ai-media-canvas manually", async () => {
  const workflowPath = ".github/workflows/publish-nextop-app-staging.yml";
  const source = await readFile(workflowPath, "utf8");
  const workflow = parseWorkflow(workflowPath);
  const on = workflowTriggers(workflow);
  const publish = workflow.jobs.publish;

  assert.equal(workflow.name, "Publish Nextop App Staging");
  assert.equal(workflow.permissions.contents, "write");
  assert.equal(on.push, undefined);
  assert.equal(on.workflow_dispatch.inputs.publish_catalog.type, "boolean");
  assert.equal(on.workflow_dispatch.inputs.publish_catalog.default, false);
  assert.equal(
    publish.uses,
    "tutti-os/tutti/.github/workflows/publish-nextop-app-release.yml@main",
  );
  assert.equal(publish.with.app_id, "ai-media-canvas");
  assert.equal(publish.with.package_command, "pnpm package:nextop");
  assert.equal(publish.with.package_dir, "build/nextop-app/package");
  assert.equal(publish.with.icon_path, "build/nextop-app/package/icon.png");
  assert.equal(publish.with.publish_catalog, "${{ inputs.publish_catalog }}");
  assert.match(source, /catalog_cloudfront_distribution_id/);
  assert.match(source, /NEXTOP_APP_RELEASES_STAGING_AWS_REGION/);
  assert.match(source, /nextop-app-releases-staging/);
});

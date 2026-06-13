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

test("production Tutti app workflow publishes ai-media-canvas on main", async () => {
  const workflowPath = ".github/workflows/publish-tutti-app.yml";
  const source = await readFile(workflowPath, "utf8");
  const workflow = parseWorkflow(workflowPath);
  const on = workflowTriggers(workflow);
  const publishPush = workflow.jobs["publish-push"];
  const publishDispatch = workflow.jobs["publish-dispatch"];

  assert.equal(workflow.name, "Publish Tutti App Production");
  assert.equal(workflow.permissions.contents, "write");
  assert.equal(workflow.permissions["id-token"], "write");
  assert.deepEqual(on.push.branches, ["main"]);
  assert.equal(on.workflow_dispatch.inputs.publish_catalog.type, "boolean");
  assert.equal(on.workflow_dispatch.inputs.publish_catalog.default, false);
  assert.equal(on.workflow_dispatch.inputs.catalog_only.type, "boolean");
  assert.equal(on.workflow_dispatch.inputs.catalog_only.default, false);
  assert.equal(
    publishPush.uses,
    "tutti-os/tutti/.github/workflows/publish-tutti-app-release.yml@main",
  );
  assert.equal(
    publishDispatch.uses,
    "tutti-os/tutti/.github/workflows/publish-tutti-app-release.yml@main",
  );
  assert.equal(publishPush.if, "${{ github.event_name != 'workflow_dispatch' }}");
  assert.equal(publishDispatch.if, "${{ github.event_name == 'workflow_dispatch' }}");
  assert.equal(publishPush.with.app_id, "ai-media-canvas");
  assert.equal(publishDispatch.with.app_id, "ai-media-canvas");
  assert.equal(publishPush.with.package_command, "pnpm package:tutti");
  assert.equal(publishPush.with.package_dir, "build/tutti-app/package");
  assert.equal(publishPush.with.icon_path, "build/tutti-app/package/icon.png");
  assert.equal(publishPush.with.release_version, "");
  assert.equal(
    publishPush.with.publish_catalog,
    "${{ (vars.TUTTI_APP_RELEASES_PRODUCTION_PUBLISH_CATALOG || vars.NEXTOP_APP_RELEASES_PRODUCTION_PUBLISH_CATALOG) == 'true' }}",
  );
  assert.equal(publishPush.with.catalog_only, false);
  assert.equal(publishDispatch.with.release_version, "${{ inputs.release_version || '' }}");
  assert.equal(publishDispatch.with.publish_catalog, "${{ inputs.publish_catalog }}");
  assert.equal(publishDispatch.with.catalog_only, "${{ inputs.catalog_only }}");
  assert.match(source, /NEXTOP_APP_RELEASES_PRODUCTION_PUBLISH_CATALOG/);
  assert.match(source, /TUTTI_APP_RELEASES_PRODUCTION_PUBLISH_CATALOG/);
  assert.match(source, /catalog_cloudfront_distribution_id/);
  assert.match(source, /TUTTI_APP_RELEASES_PRODUCTION_AWS_REGION/);
  assert.match(source, /NEXTOP_APP_RELEASES_PRODUCTION_AWS_REGION/);
  assert.match(source, /TUTTI_APP_RELEASES_AWS_ROLE_ARN/);
  assert.match(source, /NEXTOP_APP_RELEASES_AWS_ROLE_ARN/);
});

test("staging Tutti app workflow publishes ai-media-canvas manually", async () => {
  const workflowPath = ".github/workflows/publish-tutti-app-staging.yml";
  const source = await readFile(workflowPath, "utf8");
  const workflow = parseWorkflow(workflowPath);
  const on = workflowTriggers(workflow);
  const publish = workflow.jobs.publish;

  assert.equal(workflow.name, "Publish Tutti App Staging");
  assert.equal(workflow.permissions.contents, "write");
  assert.equal(on.push, undefined);
  assert.equal(on.workflow_dispatch.inputs.publish_catalog.type, "boolean");
  assert.equal(on.workflow_dispatch.inputs.publish_catalog.default, false);
  assert.equal(on.workflow_dispatch.inputs.catalog_only.type, "boolean");
  assert.equal(on.workflow_dispatch.inputs.catalog_only.default, false);
  assert.equal(
    publish.uses,
    "tutti-os/tutti/.github/workflows/publish-tutti-app-release.yml@main",
  );
  assert.equal(publish.with.app_id, "ai-media-canvas");
  assert.equal(publish.with.package_command, "pnpm package:tutti");
  assert.equal(publish.with.package_dir, "build/tutti-app/package");
  assert.equal(publish.with.icon_path, "build/tutti-app/package/icon.png");
  assert.equal(publish.with.publish_catalog, "${{ inputs.publish_catalog }}");
  assert.equal(publish.with.catalog_only, "${{ inputs.catalog_only }}");
  assert.match(source, /catalog_cloudfront_distribution_id/);
  assert.match(source, /TUTTI_APP_RELEASES_STAGING_AWS_REGION/);
  assert.match(source, /NEXTOP_APP_RELEASES_STAGING_AWS_REGION/);
  assert.match(source, /tutti-app-releases-staging/);
});

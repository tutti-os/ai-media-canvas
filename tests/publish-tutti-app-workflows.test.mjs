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

test("production Tutti app workflow publishes ai-media-canvas from a release bump", async () => {
  const workflowPath = ".github/workflows/publish-tutti-app.yml";
  const source = await readFile(workflowPath, "utf8");
  const workflow = parseWorkflow(workflowPath);
  const on = workflowTriggers(workflow);
  const publish = workflow.jobs.publish;

  assert.equal(workflow.name, "Publish Tutti App Production");
  assert.equal(workflow.permissions.contents, "write");
  assert.equal(workflow.permissions["id-token"], "write");
  assert.equal(on.push, undefined);
  assert.equal(on.workflow_dispatch.inputs.release_bump.type, "choice");
  assert.equal(on.workflow_dispatch.inputs.release_bump.default, "patch");
  assert.deepEqual(on.workflow_dispatch.inputs.release_bump.options, [
    "patch",
    "minor",
    "major",
  ]);
  assert.equal(on.workflow_dispatch.inputs.publish_catalog.type, "boolean");
  assert.equal(on.workflow_dispatch.inputs.publish_catalog.default, true);
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
  assert.equal(publish.with.release_tag_prefix, "ai-media-canvas-v");
  assert.equal(publish.with.release_bump, "${{ inputs.release_bump }}");
  assert.equal(publish.with.create_release_tag, "${{ !inputs.catalog_only }}");
  assert.equal(
    publish.with.publish_catalog,
    "${{ inputs.publish_catalog }}",
  );
  assert.equal(publish.with.catalog_only, "${{ inputs.catalog_only }}");
  assert.doesNotMatch(source, /release_version/);
  assert.doesNotMatch(source, /TUTTI_APP_RELEASES_PRODUCTION_PUBLISH_CATALOG/);
  assert.match(source, /catalog_cloudfront_distribution_id/);
  assert.match(source, /TUTTI_APP_RELEASES_PRODUCTION_AWS_REGION/);
  assert.match(source, /TUTTI_APP_RELEASES_AWS_ROLE_ARN/);
  assert.doesNotMatch(source, new RegExp("NEXT" + "OP"));
});

test("staging Tutti app workflow publishes ai-media-canvas manually", async () => {
  const workflowPath = ".github/workflows/publish-tutti-app-staging.yml";
  const source = await readFile(workflowPath, "utf8");
  const workflow = parseWorkflow(workflowPath);
  const on = workflowTriggers(workflow);
  const publish = workflow.jobs.publish;

  assert.equal(workflow.name, "Publish Tutti App Staging");
  assert.equal(workflow.permissions.contents, "read");
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
  assert.equal(publish.with.release_version, undefined);
  assert.equal(on.workflow_dispatch.inputs.release_version, undefined);
  assert.match(source, /catalog_cloudfront_distribution_id/);
  assert.match(source, /TUTTI_APP_RELEASES_STAGING_AWS_REGION/);
  assert.match(source, /tutti-app-releases-staging/);
  assert.doesNotMatch(source, new RegExp("NEXT" + "OP"));
});

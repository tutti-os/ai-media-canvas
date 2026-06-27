import { describe, expect, it } from "vitest";

import {
  buildAgentImageJobPayload,
  buildAgentVideoJobPayload,
} from "./job-payloads.js";

describe("agent job payload helpers", () => {
  it("includes phase-2 image controls in async job payloads", () => {
    expect(
      buildAgentImageJobPayload({
        prompt: "Lantern",
        title: "Lantern shot",
        model: "agnes-image/agnes-image-2.1-flash",
        aspectRatio: "1:1",
        quality: "hd",
        size: "1536x1024",
        seed: 42,
        inputImages: ["https://example.com/ref.png"],
      }),
    ).toEqual({
      prompt: "Lantern",
      title: "Lantern shot",
      model: "agnes-image/agnes-image-2.1-flash",
      aspect_ratio: "1:1",
      quality: "hd",
      size: "1536x1024",
      seed: 42,
      input_images: ["https://example.com/ref.png"],
    });
  });

  it("includes phase-2 video controls in async job payloads", () => {
    expect(
      buildAgentVideoJobPayload({
        prompt: "Lantern move",
        title: "Lantern motion",
        model: "agnes-video/agnes-video-v2.0",
        duration: 5,
        resolution: "720p",
        aspectRatio: "16:9",
        inputImages: ["https://example.com/ref.png"],
        videoMode: "keyframes",
        seed: 7,
        negativePrompt: "flicker",
        frameRate: 12,
        numFrames: 65,
        enableAudio: false,
      }),
    ).toEqual({
      prompt: "Lantern move",
      title: "Lantern motion",
      model: "agnes-video/agnes-video-v2.0",
      duration: 5,
      resolution: "720p",
      aspect_ratio: "16:9",
      input_images: ["https://example.com/ref.png"],
      video_mode: "keyframes",
      seed: 7,
      negative_prompt: "flicker",
      frame_rate: 12,
      num_frames: 65,
      enable_audio: false,
    });
  });
});

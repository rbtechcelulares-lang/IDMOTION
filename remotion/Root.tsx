import React from "react";
import { Composition } from "remotion";
import { FORMAT_SIZE } from "../shared/constants";
import { type Edl, edlDuration } from "../shared/edl";
import { Overlay } from "./Overlay";
import "./fonts";

export type OverlayProps = { edl: Edl };

export const Root: React.FC = () => (
  <Composition
    id="Overlay"
    component={Overlay as unknown as React.FC<Record<string, unknown>>}
    durationInFrames={30}
    fps={30}
    width={1080}
    height={1920}
    defaultProps={{} as Record<string, unknown>}
    calculateMetadata={({ props }) => {
      const edl = (props as unknown as OverlayProps).edl;
      const { width, height } = FORMAT_SIZE[edl.format];
      return { width, height, fps: edl.fps, durationInFrames: Math.max(1, Math.round(edlDuration(edl) * edl.fps)) };
    }}
  />
);

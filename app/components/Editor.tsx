"use client";

import AdminComponent from "@/app/components/AdminComponent";
import Canvas from "@/app/components/Canvas";
import { savePixelsToDb } from "@/app/lib/actions";
import {
  DbPixelType,
  EditorProps,
  JwtPayload,
  PixelType,
} from "@/app/lib/definitions";
import { createClient } from "@/app/lib/supabase/client";
import { useEffect, useState } from "react";
import { CirclePicker } from "react-color";
import Countdown, { CountdownApi } from "react-countdown";
import { jwtDecode } from "jwt-decode";
import { RealtimePostgresChangesPayload } from "@supabase/realtime-js";

const colors = [
  "#e6194b",
  "#f58231",
  "#ffe119",
  "#bcf60c",
  "#3cb44b",
  "#aaffc3",
  "#46f0f0",
  "#008080",
  "#4363d8",
  "#000075",
  "#911eb4",
  "#f032e6",
  "#e6beff",
  "#fabebe",
  "#fffac8",
  "#9a6324",
  "#808000",
  "#808080",
  "#000000",
  "#ffffff",
];

/**
 * The Editor component allows users to interact with a pixel canvas, choosing colors and placing pixels.
 * It includes functionalities for authenticated users, including role-based access and real-time updates.
 * @param {EditorProps} props The properties for the Editor component
 * pixelData: Array of pixel data objects to render on the canvas.
 * @returns {JSX.Element} The rendered Editor component
 */
export default function Editor({ pixelData: initialPixelData }: EditorProps) {
  const supabase = createClient();
  const [pixelData] = useState(initialPixelData);
  const [pixels, setPixels] = useState<PixelType[]>(pixelData);
  const [hex, setHex] = useState("#000000");
  const [showColorPicker, setShowColorPicker] = useState(true);
  const [countdownApi, setCountdownApi] = useState<CountdownApi | null>(null);
  const [userAllowed, setUserAllowed] = useState(true);
  const [godModeActive, setGodModeActive] = useState(false);
  const [, setClickCount] = useState(0);
  const [userRole, setUserRole] = useState("");
  const [endTime, setEndTime] = useState<number | string | Date | undefined>(
    Date.now() + 10000,
  );

  /**
   * Handles pixel update events, saving the updated pixel to the database and managing countdown timers.
   * @param {PixelType} pixel - The pixel to be updated.
   */
  const handlePixelUpdate = (pixel: PixelType) => {
    if (userAllowed && hex !== "deleteSingle") {
      savePixelsToDb(pixel.x, pixel.y, hex);
      if (countdownApi && !godModeActive) {
        setEndTime(Date.now() + 10000);
        countdownApi.start();
        setUserAllowed(false);
      }
    }

    if (hex === "deleteSingle") {
      savePixelsToDb(pixel.x, pixel.y, hex);
    }
  };

  /**
   * Toggles the admin delete single pixel mode.
   * @param {boolean} active - Whether the delete single pixel mode is active.
   */
  const handleAdminDeleteSingle = (active: boolean) => {
    if (active) {
      setHex("deleteSingle");
      setShowColorPicker(false);
    } else {
      setShowColorPicker(true);
      setHex("#000000");
    }
  };

  /**
   * Sets the reference for the countdown timer API.
   * @param {Countdown | null} countdown - The countdown component instance.
   */
  const setRef = (countdown: Countdown | null): void => {
    if (countdown) {
      setCountdownApi(countdown.getApi());
    }
  };

  /**
   * Handles delete events from the real-time database, removing the corresponding pixel.
   * @param {RealtimePostgresChangesPayload<DbPixelType>} payload - The payload from the real-time database.
   */
  const handleDeleteEvent = (
    payload: RealtimePostgresChangesPayload<DbPixelType>,
  ) => {
    const oldPayload = payload.old as DbPixelType;
    setPixels((prevPixels) =>
      prevPixels.filter((pixel) => pixel.id !== oldPayload.id),
    );
  };

  /**
   * Handles update events from the real-time database, updating the corresponding pixel.
   * @param {RealtimePostgresChangesPayload<DbPixelType>} payload - The payload from the real-time database.
   */
  const handleUpdateEvent = (
    payload: RealtimePostgresChangesPayload<DbPixelType>,
  ) => {
    const oldPayload = payload.old as DbPixelType;
    const newPayload = payload.new as DbPixelType;
    setPixels((prevPixels) =>
      prevPixels.map((pixel) =>
        pixel.id === oldPayload.id
          ? { ...pixel, color: newPayload.color }
          : pixel,
      ),
    );
  };

  /**
   * Handles insert events from the real-time database, adding the new pixel to the state.
   * @param {RealtimePostgresChangesPayload<DbPixelType>} payload - The payload from the real-time database.
   */
  const handleInsertEvent = (
    payload: RealtimePostgresChangesPayload<DbPixelType>,
  ) => {
    const newPayload = payload.new as DbPixelType;
    setPixels((prevPixels) => [
      ...prevPixels,
      {
        id: newPayload.id,
        x: newPayload.x_position,
        y: newPayload.y_position,
        color: newPayload.color,
      },
    ]);
  };

  /** Handles click events on the timer, potentially activating god mode. */
  const handleTimerClick = () => {
    setClickCount((prevCount) => {
      const newCount = prevCount + 1;
      if (newCount === 10) {
        setGodModeActive(true);
        console.log("God mode activated!");
        return 0;
      }
      return newCount;
    });
  };

  useEffect(() => {
    const {
      data: { subscription: authListener },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        const jwt: JwtPayload = jwtDecode(session.access_token);
        setUserRole(jwt.user_role);
      }
    });
    return () => {
      authListener.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("schema-db-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
        },
        (payload: RealtimePostgresChangesPayload<DbPixelType>) => {
          if (payload.eventType === "DELETE") {
            handleDeleteEvent(payload);
          } else if (payload.eventType === "UPDATE") {
            handleUpdateEvent(payload);
          } else {
            handleInsertEvent(payload);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  useEffect(() => {
    if (countdownApi) {
      setEndTime(Date.now() + 10000);
      countdownApi.start();
      setUserAllowed(false);
    }
  }, [countdownApi]);

  return (
    <div className="flex flex-row">
      <Canvas
        pixelData={pixels}
        showOverlay={true}
        onPixelClick={handlePixelUpdate}
      />
      <div className="ml-20 content-center">
        <div
          className="mb-10 flex items-center justify-center text-3xl"
          onClick={handleTimerClick}
        >
          <Countdown
            className={`${userAllowed ? "text-green-500" : "text-red-500"} rounded-xl p-1 font-bold transition-all`}
            date={endTime}
            ref={setRef}
            onComplete={() => setUserAllowed(true)}
            autoStart={false}
            daysInHours={true}
          />
        </div>
        <div
          className={`h-[210px] w-[260px] content-center rounded-2xl bg-gray-200 pl-4 transition-all dark:bg-gray-700`}
          style={{ border: `5px solid ${hex}` }}
        >
          {showColorPicker ? (
            <CirclePicker
              colors={colors}
              color={hex}
              circleSize={32}
              onChange={(color) => {
                setHex(color.hex);
              }}
            />
          ) : (
            <div>Exit pixel deletion mode to set colors!</div>
          )}
        </div>
        {userRole === "admin" && (
          <AdminComponent onDeleteSingleActive={handleAdminDeleteSingle} />
        )}
      </div>
    </div>
  );
}

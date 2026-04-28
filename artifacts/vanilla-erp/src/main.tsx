import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setDefaultRequestInit } from "@workspace/api-client-react";

setDefaultRequestInit({ credentials: "include" });

createRoot(document.getElementById("root")!).render(<App />);

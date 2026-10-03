import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import "./styles/app.css";
import "./styles/flow.css";

const elemento = document.getElementById("root");
if (!elemento) throw new Error("Elemento #root não encontrado.");

createRoot(elemento).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch((erro) => {
      console.error("Não foi possível ativar o modo offline:", erro);
    });
  });
}

import axios from "axios";

// Prefer env if set, otherwise fall back to the shared default.
const DEFAULT_API_BASE_URL = "http://localhost:3333";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL;

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});



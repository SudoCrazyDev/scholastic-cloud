import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "@/lib/api";
import { getDatabase, initDatabaseSchema } from "@/lib/db";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters long"),
});

/**
 * useLoginForm
 *
 * Encapsulates login form state, validation, submission logic,
 * and saving the authenticated user to the local SQLite database.
 *
 * @param {{ onSuccess?: () => void }} [options]
 */
export function useLoginForm(options = {}) {
  const { onSuccess } = options;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setIsSubmitting(true);
    setServerError("");

    try {
      // 1) Call Laravel /login to get token
      const loginResponse = await api.post("/api/login", values);
      const { token, token_expiry } = loginResponse.data;

      // 2) Use token to fetch full user profile
      const profileResponse = await api.get("/api/profile", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const user = profileResponse.data?.data;
      if (!user) {
        throw new Error("Invalid profile response from server.");
      }

      // 3) Ensure DB schema exists
      await initDatabaseSchema();
      const db = await getDatabase();

      // 4) Upsert user into local SQLite `users` table
      await db.execute(
        `
        INSERT INTO users (
          id,
          first_name,
          middle_name,
          last_name,
          ext_name,
          gender,
          birthdate,
          email,
          email_verified_at,
          password,
          token,
          token_expiry,
          is_new,
          role_id,
          created_at,
          updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        ON CONFLICT(id) DO UPDATE SET
          first_name = excluded.first_name,
          middle_name = excluded.middle_name,
          last_name = excluded.last_name,
          ext_name = excluded.ext_name,
          gender = excluded.gender,
          birthdate = excluded.birthdate,
          email = excluded.email,
          email_verified_at = excluded.email_verified_at,
          token = excluded.token,
          token_expiry = excluded.token_expiry,
          is_new = excluded.is_new,
          role_id = excluded.role_id,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at;
        `,
        [
          user.id,
          user.first_name,
          user.middle_name ?? null,
          user.last_name ?? null,
          user.ext_name ?? null,
          user.gender ?? null,
          user.birthdate ?? null,
          user.email,
          user.email_verified_at ?? null,
          null, // password is never returned from profile; keep null locally
          token,
          token_expiry ?? null,
          user.is_new ? 1 : 0,
          null, // role_id is not part of profile payload; can be wired later if needed
          user.created_at ?? null,
          user.updated_at ?? null,
        ]
      );


      // 5) Notify caller so UI can move to the loading page
      if (typeof onSuccess === "function") {
        onSuccess();
      }
    } catch (error) {
      if (error.response?.status === 401) {
        setServerError("Invalid email or password.");
      } else if (error.response?.data?.message) {
        setServerError(error.response.data.message);
      } else {
        setServerError("Unable to sign in. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  });

  return {
    register,
    onSubmit,
    errors,
    isSubmitting,
    serverError,
  };
}



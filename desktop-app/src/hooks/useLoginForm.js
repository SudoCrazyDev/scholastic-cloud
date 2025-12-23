import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters long"),
});

/**
 * useLoginForm
 *
 * Encapsulates login form state, validation, and submission logic.
 * Keeps UI components focused on rendering.
 */
export function useLoginForm() {
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
      // TODO: Replace with real auth call when backend is ready.
      console.log("Login attempt:", values);
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      setServerError("Unable to sign in. Please try again.");
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



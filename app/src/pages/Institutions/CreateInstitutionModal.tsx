import React, { useState } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { Button } from '../../components/button';
import { Input } from '../../components/input';
import { Fieldset, Field, Label, ErrorMessage } from '../../components/fieldset';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../../components/dialog'; // DialogCloseButton is not exported from component
import { motion } from 'framer-motion';
import { Institution, InstitutionCreatePayload } from '../../types/institution'; // Using local placeholder type

interface CreateInstitutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInstitutionCreated: (institution: Institution) => void;
}

// Mock API call function
const mockCreateInstitutionApi = async (data: InstitutionCreatePayload): Promise<Institution> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const newInstitution: Institution = {
        id: `inst-${Math.random().toString(36).substr(2, 9)}`,
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      console.log('Mock API: Creating institution', newInstitution);
      resolve(newInstitution);
    }, 1000);
  });
};

export const CreateInstitutionModal: React.FC<CreateInstitutionModalProps> = ({ isOpen, onClose, onInstitutionCreated }) => {
  const [formError, setFormError] = useState<string | null>(null);

  const formik = useFormik<InstitutionCreatePayload>({
    initialValues: {
      name: '',
      location: '',
      type: '',
    },
    validationSchema: Yup.object({
      name: Yup.string().required('Institution name is required'),
      location: Yup.string(),
      type: Yup.string(),
    }),
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      setFormError(null);
      try {
        const newInstitution = await mockCreateInstitutionApi(values);
        onInstitutionCreated(newInstitution);
        resetForm();
        onClose(); // Close modal on success
      } catch (error) {
        setFormError(error instanceof Error ? error.message : 'Failed to create institution.');
      } finally {
        setSubmitting(false);
      }
    },
  });

  // Handler to also reset form state when modal is closed externally
  const handleClose = () => {
    formik.resetForm();
    setFormError(null);
    onClose();
  };


  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onClose={handleClose} size="lg">
      <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.2 }}
      >
        <DialogTitle>Create New Institution</DialogTitle>
        <DialogDescription>
          Fill in the details below to add a new institution.
        </DialogDescription>

        {formError && (
          <div className="mt-3 mb-2 p-3 text-sm text-red-700 bg-red-100 rounded-md" role="alert">
            {formError}
          </div>
        )}

        <form onSubmit={formik.handleSubmit}>
          <DialogBody className="mt-4 space-y-4">
            <Fieldset>
              <Field>
                <Label htmlFor="institution-name">Institution Name</Label>
                <Input
                  id="institution-name"
                  name="name"
                  type="text"
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  value={formik.values.name}
                  aria-invalid={formik.touched.name && !!formik.errors.name}
                />
                {formik.touched.name && formik.errors.name ? (
                  <ErrorMessage>{formik.errors.name}</ErrorMessage>
                ) : null}
              </Field>
              <Field>
                <Label htmlFor="institution-location">Location (Optional)</Label>
                <Input
                  id="institution-location"
                  name="location"
                  type="text"
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  value={formik.values.location}
                />
              </Field>
              <Field>
                <Label htmlFor="institution-type">Type (Optional)</Label>
                <Input
                  id="institution-type"
                  name="type"
                  type="text"
                  placeholder="e.g., University, College"
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  value={formik.values.type}
                />
              </Field>
            </Fieldset>
          </DialogBody>
          <DialogActions className="mt-6">
            <Button type="button" variant="outline" onClick={handleClose} disabled={formik.isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={formik.isSubmitting}>
              {formik.isSubmitting ? 'Creating...' : 'Create Institution'}
            </Button>
          </DialogActions>
        </form>
        {/* The Dialog component from Headless UI typically handles close via Escape key or clicking backdrop.
            If a visible close button is needed, it would usually be part of DialogTitle or a custom addition.
            The provided Dialog component does not seem to have a specific DialogCloseButton export.
            So, we rely on the standard ways to close the dialog (e.g., Cancel button, Esc key). */}
      </motion.div>
    </Dialog>
  );
};

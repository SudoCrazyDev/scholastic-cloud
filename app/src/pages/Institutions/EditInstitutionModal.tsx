import React, { useState, useEffect } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { Button } from '../../components/button';
import { Input } from '../../components/input';
import { Fieldset, Field, Label, ErrorMessage } from '../../components/fieldset';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../../components/dialog';
import { motion } from 'framer-motion';
import { Institution, InstitutionUpdatePayload } from '../../types/institution'; // Using local placeholder type

interface EditInstitutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  institution: Institution | null;
  onInstitutionUpdated: (institution: Institution) => void;
}

// Mock API call function
const mockUpdateInstitutionApi = async (id: string, data: InstitutionUpdatePayload): Promise<Institution> => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (!id) return reject(new Error("Institution ID is required for update."));
      const updatedInstitution: Institution = {
        id,
        name: data.name || "Unknown Institution", // Fallback, should be handled by form
        location: data.location,
        type: data.type,
        createdAt: new Date().toISOString(), // This would typically not change on update
        updatedAt: new Date().toISOString(),
      };
      console.log('Mock API: Updating institution', updatedInstitution);
      resolve(updatedInstitution);
    }, 1000);
  });
};

export const EditInstitutionModal: React.FC<EditInstitutionModalProps> = ({ isOpen, onClose, institution, onInstitutionUpdated }) => {
  const [formError, setFormError] = useState<string | null>(null);

  const formik = useFormik<InstitutionUpdatePayload>({
    initialValues: {
      name: institution?.name || '',
      location: institution?.location || '',
      type: institution?.type || '',
    },
    enableReinitialize: true, // Important to reinitialize form when `institution` prop changes
    validationSchema: Yup.object({
      name: Yup.string().required('Institution name is required'),
      location: Yup.string(),
      type: Yup.string(),
    }),
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      if (!institution?.id) {
        setFormError("Cannot update institution without an ID.");
        setSubmitting(false);
        return;
      }
      setFormError(null);
      try {
        const updatedInstitutionData = await mockUpdateInstitutionApi(institution.id, values);
        onInstitutionUpdated(updatedInstitutionData);
        resetForm(); // Reset form after successful submission
        onClose(); // Close modal on success
      } catch (error) {
        setFormError(error instanceof Error ? error.message : 'Failed to update institution.');
      } finally {
        setSubmitting(false);
      }
    },
  });

  // Effect to update form values if the institution prop changes while modal is open
  useEffect(() => {
    if (institution && isOpen) {
      formik.setValues({
        name: institution.name,
        location: institution.location || '',
        type: institution.type || '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [institution, isOpen]); // formik is not added to dep array

  const handleClose = () => {
    // formik.resetForm(); // Resetting form on close might be too aggressive if user wants to reopen and see last state
    setFormError(null);
    onClose();
  };

  if (!isOpen || !institution) return null;

  return (
    <Dialog open={isOpen} onClose={handleClose} size="lg">
       <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.2 }}
      >
        <DialogTitle>Edit Institution: {institution.name}</DialogTitle>
        <DialogDescription>
          Update the details for this institution.
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
                <Label htmlFor={`edit-institution-name-${institution.id}`}>Institution Name</Label>
                <Input
                  id={`edit-institution-name-${institution.id}`}
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
                <Label htmlFor={`edit-institution-location-${institution.id}`}>Location (Optional)</Label>
                <Input
                  id={`edit-institution-location-${institution.id}`}
                  name="location"
                  type="text"
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  value={formik.values.location}
                />
              </Field>
              <Field>
                <Label htmlFor={`edit-institution-type-${institution.id}`}>Type (Optional)</Label>
                <Input
                  id={`edit-institution-type-${institution.id}`}
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
              {formik.isSubmitting ? 'Saving Changes...' : 'Save Changes'}
            </Button>
          </DialogActions>
        </form>
      </motion.div>
    </Dialog>
  );
};

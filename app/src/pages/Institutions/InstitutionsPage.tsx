import React, { useState, useMemo } from 'react';
// import { Link } from 'react-router-dom'; // No separate create page, using modal
import { Button } from '../../components/button';
import { Heading } from '../../components/heading';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/table';
import { Pagination, PaginationList, PaginationPage, PaginationNext, PaginationPrevious } from '../../components/pagination';
import { Input } from '../../components/input';
import { Institution } from '../../types/institution'; // Using local placeholder type
import { motion } from 'framer-motion';
import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { CreateInstitutionModal } from './CreateInstitutionModal'; // To be created
import { EditInstitutionModal } from './EditInstitutionModal'; // To be created

// Mock data for institutions
const mockInstitutionsData: Institution[] = [
  { id: 'inst1', name: 'Grand University', location: 'New York, USA', type: 'University', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'inst2', name: 'Tech Institute', location: 'San Francisco, USA', type: 'Vocational', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'inst3', name: 'Community College', location: 'Chicago, USA', type: 'College', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'inst4', name: 'Arts Academy', location: 'Los Angeles, USA', type: 'Academy', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

const ITEMS_PER_PAGE = 10;

const InstitutionsPage: React.FC = () => {
  const [institutions, setInstitutions] = useState<Institution[]>(mockInstitutionsData);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedInstitution, setSelectedInstitution] = useState<Institution | null>(null);


  const filteredInstitutions = useMemo(() => {
    return institutions.filter(inst =>
      inst.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inst.location && inst.location.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [institutions, searchTerm]);

  const totalPages = Math.ceil(filteredInstitutions.length / ITEMS_PER_PAGE);
  const paginatedInstitutions = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    return filteredInstitutions.slice(start, end);
  }, [filteredInstitutions, currentPage]);

  const handleDeleteInstitution = (institutionId: string) => {
    setInstitutions(prev => prev.filter(inst => inst.id !== institutionId));
    alert(`Institution with ID: ${institutionId} would be deleted.`);
  };

  const handleOpenEditModal = (institution: Institution) => {
    setSelectedInstitution(institution);
    setIsEditModalOpen(true);
  };

  const handleInstitutionCreated = (newInstitution: Institution) => {
    setInstitutions(prev => [newInstitution, ...prev]); // Add to the beginning of the list
  };

  const handleInstitutionUpdated = (updatedInstitution: Institution) => {
    setInstitutions(prev => prev.map(inst => inst.id === updatedInstitution.id ? updatedInstitution : inst));
  };


  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <Heading level={1}>Institutions</Heading>
        <Button onClick={() => setIsCreateModalOpen(true)}>Create New Institution</Button>
      </div>

      <div className="mb-4">
        <Input
          type="text"
          placeholder="Search institutions by name or location..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
          className="w-full sm:w-1/3"
          aria-label="Search institutions"
        />
      </div>

      {paginatedInstitutions.length > 0 ? (
        <>
          <Table bleed dense striped>
            <TableHead>
              <TableRow>
                <TableHeader>Name</TableHeader>
                <TableHeader>Location</TableHeader>
                <TableHeader>Type</TableHeader>
                <TableHeader>Created At</TableHeader>
                <TableHeader><span className="sr-only">Actions</span></TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedInstitutions.map((institution) => (
                <TableRow key={institution.id} hover>
                  <TableCell className="font-medium">{institution.name}</TableCell>
                  <TableCell>{institution.location || 'N/A'}</TableCell>
                  <TableCell>{institution.type || 'N/A'}</TableCell>
                  <TableCell>{new Date(institution.createdAt!).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <button onClick={() => handleOpenEditModal(institution)} title="Edit institution">
                        <PencilIcon className="h-5 w-5 text-gray-500 hover:text-indigo-600" />
                      </button>
                      <button onClick={() => handleDeleteInstitution(institution.id)} title="Delete institution">
                        <TrashIcon className="h-5 w-5 text-gray-500 hover:text-red-600" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {totalPages > 1 && (
             <div className="mt-6 flex justify-center">
              <Pagination>
                <PaginationPrevious
                  href={currentPage > 1 ? `#page-${currentPage - 1}` : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    if (currentPage > 1) setCurrentPage(currentPage - 1);
                  }}
                  disabled={currentPage === 1}
                />
                <PaginationList>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNumber) => (
                    <PaginationPage
                      key={pageNumber}
                      href={`#page-${pageNumber}`}
                      current={pageNumber === currentPage}
                      onClick={(e) => {
                        e.preventDefault();
                        setCurrentPage(pageNumber);
                      }}
                    >
                      {pageNumber}
                    </PaginationPage>
                  ))}
                </PaginationList>
                <PaginationNext
                  href={currentPage < totalPages ? `#page-${currentPage + 1}` : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                  }}
                  disabled={currentPage === totalPages}
                />
              </Pagination>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-10">
          <Heading level={3}>No Institutions Found</Heading>
          <p className="text-gray-500">
            {searchTerm ? "No institutions match your search criteria." : "There are no institutions to display."}
          </p>
        </div>
      )}

      <CreateInstitutionModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onInstitutionCreated={handleInstitutionCreated}
      />

      {selectedInstitution && (
        <EditInstitutionModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setSelectedInstitution(null);
          }}
          institution={selectedInstitution}
          onInstitutionUpdated={handleInstitutionUpdated}
        />
      )}

    </motion.div>
  );
};

export default InstitutionsPage;

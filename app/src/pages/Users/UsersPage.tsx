import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/button';
import { Heading } from '../../components/heading';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/table';
import { Pagination, PaginationList, PaginationPage, PaginationNext, PaginationPrevious } from '../../components/pagination'; // Updated import
import { Input } from '../../components/input';
import { User } from 'shared/src/types/user'; // API types
import { motion } from 'framer-motion';
import { EyeIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Badge } from '../../components/badge'; // Assuming this component exists

// Mock data for users
const mockUsers: User[] = [
  { id: '1', name: 'Alice Wonderland', email: 'alice@example.com', status: 'active', role: { id: '1', name: 'Admin' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: '2', name: 'Bob The Builder', email: 'bob@example.com', status: 'invited', role: { id: '2', name: 'Editor' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: '3', name: 'Charlie Brown', email: 'charlie@example.com', status: 'active', role: { id: '3', name: 'Viewer' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: '4', name: 'Diana Prince', email: 'diana@example.com', status: 'inactive', role: { id: '2', name: 'Editor' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: '5', name: 'Edward Scissorhands', email: 'edward@example.com', status: 'active', role: { id: '1', name: 'Admin' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

const ITEMS_PER_PAGE = 10;

const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>(mockUsers);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  // const [filterStatus, setFilterStatus] = useState<string>(''); // Example filter

  const filteredUsers = useMemo(() => {
    return users.filter(user =>
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
      // && (filterStatus === '' || user.status === filterStatus)
    );
  }, [users, searchTerm]);

  const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    return filteredUsers.slice(start, end);
  }, [filteredUsers, currentPage]);

  const handleDeleteUser = (userId: string) => {
    // Mock delete:
    setUsers(prevUsers => prevUsers.filter(user => user.id !== userId));
    // In a real app, you would make an API call here
    // Example: axios.delete(`/api/users/${userId}`).then(...)
    alert(`User with ID: ${userId} would be deleted.`);
  };

  const getStatusBadgeVariant = (status: string | undefined) => {
    switch (status) {
      case 'active': return 'success';
      case 'invited': return 'warning';
      case 'inactive': return 'danger';
      default: return 'neutral';
    }
  };


  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <Heading level={1}>Users</Heading>
        <Link to="/users/new">
          <Button>Create New User</Button>
        </Link>
      </div>

      <div className="mb-4">
        <Input
          type="text"
          placeholder="Search users by name or email..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1); // Reset to first page on search
          }}
          className="w-full sm:w-1/3"
          aria-label="Search users"
        />
        {/* Add more filters here if needed, e.g., by status or role */}
      </div>

      {paginatedUsers.length > 0 ? (
        <>
          <Table bleed dense striped>
            <TableHead>
              <TableRow>
                <TableHeader>Name</TableHeader>
                <TableHeader>Email</TableHeader>
                <TableHeader>Role</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Joined</TableHeader>
                <TableHeader><span className="sr-only">Actions</span></TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedUsers.map((user) => (
                <TableRow key={user.id} hover>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.role?.name || 'N/A'}</TableCell>
                  <TableCell>
                    <Badge color={getStatusBadgeVariant(user.status)}>{user.status || 'Unknown'}</Badge>
                  </TableCell>
                  <TableCell>{new Date(user.createdAt!).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Link to={`/users/view/${user.id}`} title="View user details"> {/* Assuming a view page or modal */}
                        <EyeIcon className="h-5 w-5 text-gray-500 hover:text-indigo-600" />
                      </Link>
                      <Link to={`/users/edit/${user.id}`} title="Edit user">
                        <PencilIcon className="h-5 w-5 text-gray-500 hover:text-indigo-600" />
                      </Link>
                      <button onClick={() => handleDeleteUser(user.id)} title="Delete user">
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
                  href={currentPage > 1 ? `#page-${currentPage - 1}` : null}
                  onClick={(e) => {
                    e.preventDefault();
                    if (currentPage > 1) setCurrentPage(currentPage - 1);
                  }}
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
                  href={currentPage < totalPages ? `#page-${currentPage + 1}` : null}
                  onClick={(e) => {
                    e.preventDefault();
                    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                  }}
                />
              </Pagination>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-10">
          <Heading level={3}>No Users Found</Heading>
          <p className="text-gray-500">
            {searchTerm ? "No users match your search criteria." : "There are no users to display."}
          </p>
        </div>
      )}
    </motion.div>
  );
};

export default UsersPage;

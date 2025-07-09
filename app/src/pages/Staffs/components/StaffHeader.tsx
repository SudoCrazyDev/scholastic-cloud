import React from 'react';
import { Input } from '../../../components/input';
import { Button } from '../../../components/button';

interface StaffHeaderProps {
  search: string;
  onSearch: (value: string) => void;
  onCreate: () => void;
}

const StaffHeader: React.FC<StaffHeaderProps> = ({ search, onSearch, onCreate }) => {
  return (
    <div className="flex items-center justify-between mb-4 animate-fade-in">
      <Input
        value={search}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearch(e.target.value)}
        placeholder="Search staff by name or email..."
        className="w-1/3"
      />
      <Button onClick={onCreate} className="ml-4">
        + Create Staff
      </Button>
    </div>
  );
};

export default StaffHeader; 
import React from 'react';
import { SearchInput } from '../../../components/search-input';
import { Button } from '../../../components/button';

interface StaffHeaderProps {
  search: string;
  onSearch: (value: string) => void;
  onCreate: () => void;
}

const StaffHeader: React.FC<StaffHeaderProps> = ({ search, onSearch, onCreate }) => {
  return (
    <div className="flex items-center justify-between mb-4 animate-fade-in">
      <SearchInput
        value={search}
        onChange={onSearch}
        placeholder="Search staff by name or email..."
        className="w-full"
        debounceMs={300}
      />
      <Button onClick={onCreate} className="ml-4">
        + Create Staff
      </Button>
    </div>
  );
};

export default StaffHeader; 
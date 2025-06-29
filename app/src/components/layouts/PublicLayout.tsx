import { Outlet } from 'react-router-dom';

const PublicLayout = () => {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-full">
        <Outlet />
      </div>
    </div>
  );
};

export default PublicLayout;
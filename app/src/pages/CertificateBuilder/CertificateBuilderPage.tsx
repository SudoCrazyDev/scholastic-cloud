import { useSearchParams } from 'react-router-dom';
import CertificateBuilder from './CertificateBuilder';
import CertificateList from './CertificateList';

/**
 * Certificate Builder entry: show list of certificates for the institution first.
 * When ?id= is present, show the builder (edit). Use /certificate-builder/new for new certificate.
 */
export default function CertificateBuilderPage() {
	const [searchParams] = useSearchParams();
	const certificateId = searchParams.get('id');

	// If editing a specific certificate, show the builder
	if (certificateId) {
		return <CertificateBuilder />;
	}

	// Otherwise show the list (with "Create New Certificate" → /certificate-builder/new)
	return <CertificateList />;
}

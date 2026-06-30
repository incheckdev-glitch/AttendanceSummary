(function initCompanyVerification(global) {
  function isVerifiedValue(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    return value === true ||
      normalized === 'true' ||
      normalized === 'yes' ||
      normalized === 'verified' ||
      normalized === 'approved';
  }

  function getCompanyVerificationStatus(company, documents = []) {
    const hasVerifiedFlag =
      isVerifiedValue(company?.is_verified) ||
      isVerifiedValue(company?.verified) ||
      isVerifiedValue(company?.company_verified) ||
      isVerifiedValue(company?.authorized_signatory_verified) ||
      isVerifiedValue(company?.verification_status) ||
      isVerifiedValue(company?.documents_verified) ||
      isVerifiedValue(company?.documentsVerificationStatus) ||
      isVerifiedValue(company?.documents_verification_status);

    const hasVerifiedDocument = (Array.isArray(documents) ? documents : []).some(doc =>
      isVerifiedValue(doc?.is_verified) ||
      isVerifiedValue(doc?.verified) ||
      isVerifiedValue(doc?.status) ||
      isVerifiedValue(doc?.verification_status)
    );

    return hasVerifiedFlag || hasVerifiedDocument;
  }

  function getCompanyAuthorizedSignatory(company) {
    const name =
      company?.authorized_signatory_name ||
      company?.authorizedSignatoryName ||
      company?.authorized_signatory_full_name ||
      company?.authorizedSignatoryFullName ||
      company?.signatory_name ||
      company?.signatoryName ||
      company?.customer_signatory_name ||
      company?.customerSignatoryName ||
      company?.customer_authorized_signatory_name ||
      company?.customerAuthorizedSignatoryName ||
      company?.company_authorized_signatory_name ||
      company?.companyAuthorizedSignatoryName ||
      company?.representative_name ||
      company?.representativeName ||
      '';

    const title =
      company?.authorized_signatory_title ||
      company?.authorizedSignatoryTitle ||
      company?.signatory_title ||
      company?.signatoryTitle ||
      company?.customer_signatory_title ||
      company?.customerSignatoryTitle ||
      company?.customer_authorized_signatory_title ||
      company?.customerAuthorizedSignatoryTitle ||
      company?.company_authorized_signatory_title ||
      company?.companyAuthorizedSignatoryTitle ||
      company?.representative_title ||
      company?.representativeTitle ||
      '';

    return {
      name: String(name || '').trim(),
      title: String(title || '').trim()
    };
  }

  global.CompanyVerification = {
    isVerifiedValue,
    getCompanyVerificationStatus,
    getCompanyAuthorizedSignatory
  };
})(typeof window !== 'undefined' ? window : globalThis);

package secure

// // ValidatePassword 验证密码
// func ValidatePassword2(inputPassword, storedHash string) bool {
// 	hasher := sha1.New()
// 	hasher.Write([]byte(inputPassword))
// 	hashedInput := hex.EncodeToString(hasher.Sum(nil))
// 	return hashedInput == storedHash
// }

// // HashPassword 哈希密码
// func HashPassword2(password string) string {
// 	hasher := sha1.New()
// 	hasher.Write([]byte(password))
// 	return hex.EncodeToString(hasher.Sum(nil))
// }

// ValidatePassword 验证密码
func ValidatePassword(inputPassword, storedHash string) bool {
	phc, err := ParsePHC(storedHash)
	if err != nil {
		xlog.WithError(err).Errorf("validate password failed")
		return false
	}
	err = phc.Verify(inputPassword)
	if err != nil {
		xlog.WithError(err).Errorf("validate password failed")
		return false
	}
	return true
}

// HashPassword 哈希密码
func HashPassword(password string) string {
	passwdHash, err := defaultPHC.Hash(password)
	if err != nil {
		xlog.WithError(err).Errorf("hash password failed")
		return ""
	}
	return passwdHash
}

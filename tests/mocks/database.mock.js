const pool = require('../src/config/database');

// Mock database helper
const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn();

const mockClient = {
  query: mockQuery,
  release: mockRelease
};

jest.mock('../src/config/database', () => ({
  connect: mockConnect,
  query: mockQuery
}));

module.exports = {
  mockClient,
  mockQuery,
  mockRelease,
  mockConnect
};

#ifndef UTILS_H
#define UTILS_H

#include <stddef.h>

#ifdef DEBUG
  #undef DEBUG
  #define DEBUG 1
#else
  #define DEBUG 0
#endif

/* marks a parameter as unused (to prevent triggering Wunused-parameter) */
#define UNUSED(x) do { (void)(x); } while (0)

/* aborts with an error message */
#define error(fmt, ...) internal_error(__FILE__, __LINE__, fmt, ##__VA_ARGS__)
void internal_error(const char *file, const int line, const char *format, ...);

/* prints a debugging message */
#define debug(fmt, ...) internal_debug(__FILE__, __LINE__, fmt, ##__VA_ARGS__)
void internal_debug(const char *file, const int line, const char *format, ...);

/* logs a debugging message to log.txt */
#define log(fmt, ...) internal_log(__FILE__, __LINE__, fmt, ##__VA_ARGS__)
void internal_log(const char *file, const int line, const char *format, ...);

/* clears log.txt */
void log_clear(void);

/* Allocate memory for a 2D array of arbitrary type with a given size, matching
   row indices to the corresponding memory locations. */
void* malloc_2d(size_t ni, size_t nj, size_t size);

/* Allocate memory for a 2D array of arbitrary type with a given size, matching
   row indices to the corresponding memory locations. Also sets memory to
   zero. */
void* calloc_2d(size_t ni, size_t nj, size_t size);

/* Frees memory associated with a 2D array */
#define free_2d(A) internal_free_2d((void **)A)
void internal_free_2d(void** arr);

/* Allocate memory for a 3D array of arbitrary type with a given size, matching
   row and column indices to the corresponding memory locations. */
void* malloc_3d(size_t ni, size_t nj, size_t nk, size_t size);

/* Allocate memory for a 3D array of arbitrary type with a given size, matching
   row and column indices to the corresponding memory locations. Also sets
   memory to zero. */
void* calloc_3d(size_t ni, size_t nj, size_t nk, size_t size);

/* Frees memory associated with a 2D array */
#define free_3d(A) internal_free_3d((void ***)A)
void internal_free_3d(void*** arr);

/* returns a uniformly distributed random double between 0 and 1 */
double frand(void);

/* returns a uniformly distributed random non-negative int < max */
int drand(int max);

/* sleep for the requested number of milliseconds. Return as for nanosleep. */
int msleep(long msec);

#endif

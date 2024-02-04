#include "utils.h"

#include <stdlib.h>
#include <stdio.h>
#include <stdarg.h>
#include <time.h>
#include <errno.h>


__attribute__((__format__ (__printf__, 3, 4)))
void internal_error(const char *file, const int line, const char *format, ...) {
  va_list args;
  va_start(args, format);

  fprintf(stderr, "%s:%d: ERROR: ", file, line);
  vfprintf(stderr, format, args);
  fprintf(stderr, "\n");

  va_end(args);

  exit(1);
}


#if DEBUG
__attribute__((__format__ (__printf__, 3, 4)))
void internal_debug(const char *file, const int line, const char *format, ...) {
  va_list args;
  va_start(args, format);

  fprintf(stderr, "%s:%d: DEBUG: ", file, line);
  vfprintf(stderr, format, args);
  fprintf(stderr, "\n");

  va_end(args);
}
#else
void internal_debug(const char *file, const int line, const char *format, ...) {
  UNUSED(file);
  UNUSED(line);
  UNUSED(format);
}
#endif


void internal_log(const char *file, const int line, const char *format, ...) {
  /* open log.txt in append mode */
  FILE *fp = fopen("log.txt", "a");

  va_list args;
  va_start(args, format);

  fprintf(fp, "%s:%d: ", file, line);
  vfprintf(fp, format, args);
  fprintf(fp, "\n");

  va_end(args);

  fclose(fp);
}


void log_clear(void) {
  /* open log.txt in append mode */
  FILE *fp = fopen("log.txt", "w");
  fclose(fp);
}


void* malloc_2d(size_t ni, size_t nj, size_t size) {
  /* allocate row memory */
  void **p_2arr = malloc(ni*sizeof(void*));
  if (!p_2arr) { return NULL; }

  /* allocate main memory */
  char *mem = malloc(ni*nj*size);
  if (!mem) { free(p_2arr); return NULL; }

  /* match rows to memory */
  for (size_t i = 0; i < ni; i++) {
    p_2arr[i] = &(mem[i*nj*size]);
  } // i end

  return p_2arr;
}


void* calloc_2d(size_t ni, size_t nj, size_t size) {
  /* allocate row memory */
  void **p_2arr = malloc(ni*sizeof(void*));
  if (!p_2arr) { return NULL; }

  /* allocate main memory */
  char *mem = calloc(ni*nj, size);
  if (!mem) { free(p_2arr); return NULL; }

  /* match rows to memory */
  for (size_t i = 0; i < ni; i++) {
    p_2arr[i] = &(mem[i*nj*size]);
  } // i end

  return p_2arr;
}


void internal_free_2d(void** arr) {
  if (arr) { free(*arr); }
  free(arr);
}


void* malloc_3d(size_t ni, size_t nj, size_t nk, size_t size) {
  /* allocate row memory */
  void ***p_3arr = malloc(ni*sizeof(void**));
  if (!p_3arr) { return NULL; }

  /* allocate column memory */
  void **p_2arr = malloc(ni*nj*sizeof(void*));
  if (!p_2arr) { free(p_3arr); return NULL; }

  /* allocate main memory */
  char *mem = malloc(ni*nj*nk*size);
  if (!mem) { free(p_3arr); free(p_2arr); return NULL; }

  /* match rows to cols */
  for (size_t i = 0; i < ni; i++) {
    p_3arr[i] = &(p_2arr[i*nj]);
  } // i end

  /* match rows to cols to mem */
  for (size_t i = 0; i < ni; i++) {
    for (size_t j = 0; j < nj; j++) {
      p_3arr[i][j] = &(mem[(i*nj*nk + j*nk)*size]);
    } // j end
  } // i end

  return p_3arr;
}


void* calloc_3d(size_t ni, size_t nj, size_t nk, size_t size) {
  /* allocate row memory */
  void ***p_3arr = malloc(ni*sizeof(void**));
  if (!p_3arr) { return NULL; }

  /* allocate column memory */
  void **p_2arr = malloc(ni*nj*sizeof(void*));
  if (!p_2arr) { free(p_3arr); return NULL; }

  /* allocate main memory */
  char *mem = calloc(ni*nj*nk, size);
  if (!mem) { free(p_3arr); free(p_2arr); return NULL; }

  /* match rows to cols */
  for (size_t i = 0; i < ni; i++) {
    p_3arr[i] = &(p_2arr[i*nj]);
  } // i end

  /* match rows to cols to mem */
  for (size_t i = 0; i < ni; i++) {
    for (size_t j = 0; j < nj; j++) {
      p_3arr[i][j] = &(mem[(i*nj*nk + j*nk)*size]);
    } // j end
  } // i end

  return p_3arr;
}


void internal_free_3d(void*** arr) {
  if (arr) {
    if (*arr) { free(**arr); }
    free(*arr);
  }
  free(arr);
}


double frand(void) {
  const int r = rand();
  return ((double)r)/((double)RAND_MAX);
}


int drand(int max) {
  return rand() % max;
}


int msleep(long msec) {
  struct timespec ts;
  int res;

  if (msec < 0) {
    errno = EINVAL;
    return -1;
  }

  ts.tv_sec = msec / 1000;
  ts.tv_nsec = (msec % 1000) * 1000000;

  do {
    res = nanosleep(&ts, &ts);
  } while (res && errno == EINTR);

  return res;
}

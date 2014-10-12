module.exports = function(grunt) {
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    browserify: {
      production: {
        src: ['src/app.js'],
        dest: 'public/app.js',
        options: {
          browserifyOptions: {
            standalone: 'App'
          }
        }
      }
    },
    clean: {
      builds: {
        src: ['public/app.js']
      }
    },
    jshint: {
      options: {
        asi: true,
        camelcase: true,
        freeze: true,
        immed: true,
        indent: 2,
        latedef: true,
        maxcomplexity: 10,
        maxlen: 120,
        noarg: true,
        noempty: true,
        nonbsp: true,
        node: true,
        nonew: true,
        undef: true,
        unused: true,
        strict: false,
        trailing: true
      },
      files: ['index.js']
    },
    uglify: {
      production: {
        files: {
          'public/app.min.js': 'public/app.js'
        }
      }
    }
  })

  grunt.loadNpmTasks('grunt-browserify')
  grunt.loadNpmTasks('grunt-contrib-clean')
  grunt.loadNpmTasks('grunt-contrib-jshint')
  grunt.loadNpmTasks('grunt-contrib-uglify')

  grunt.registerTask('compile', ['browserify:production', 'uglify:production'])
}
